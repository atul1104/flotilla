import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from './context/AuthProvider';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { AcceptInvite } from './pages/AcceptInvite';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { WorkspacePicker } from './pages/WorkspacePicker';
import { Home } from './pages/Home';
import { Members } from './pages/Members';
import { Settings } from './pages/Settings';
import { ChannelView } from './pages/ChannelView';
import { Tasks } from './pages/Tasks';
import { Agents } from './pages/Agents';
import { Notifications } from './pages/Notifications';
import { Spinner } from './components/ui/Button';

// Heavy pages: lazy-load so Recharts/markdown don't bloat the initial bundle.
const Usage = lazy(() => import('./pages/Usage').then((m) => ({ default: m.Usage })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })));

function PageSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="h-6 w-6 text-[var(--color-fg-muted)]" />
    </div>
  );
}

function PublicOnly({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <Signup />
          </PublicOnly>
        }
      />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Root: workspace picker / redirect */}
      <Route path="/" element={<WorkspacePicker />} />

      {/* Workspace-scoped app */}
      <Route path="/:workspaceSlug" element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="channels/:channelId" element={<ChannelView />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="agents" element={<Agents />} />
        <Route path="members" element={<Members />} />
        <Route
          path="activity"
          element={
            <Suspense fallback={<PageSpinner />}>
              <Activity />
            </Suspense>
          }
        />
        <Route
          path="usage"
          element={
            <Suspense fallback={<PageSpinner />}>
              <Usage />
            </Suspense>
          }
        />
        <Route path="notifications" element={<Notifications />} />
        <Route
          path="search"
          element={
            <Suspense fallback={<PageSpinner />}>
              <Search />
            </Suspense>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-6xl font-bold">404</p>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">This page drifted off.</p>
      </div>
    </div>
  );
}
