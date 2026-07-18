import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthProvider';
import { Spinner } from '../ui/Button';

/** Loads the active workspace by slug and provides it to the sidebar + children
 *  via context. Routes are workspace-scoped: /:workspaceSlug/... */
export function AppLayout() {
  const { workspaceSlug } = useParams();
  const { isAuthenticated, isLoading } = useAuth();

  const ws = useQuery({
    queryKey: ['workspace', workspaceSlug],
    queryFn: () => api.get(`/workspaces/${workspaceSlug}`),
    enabled: !!workspaceSlug && isAuthenticated,
  });

  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (ws.isLoading) return <FullScreenSpinner />;
  if (ws.isError || !ws.data) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full">
      <Sidebar workspace={ws.data} />
      <RealtimeProvider>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar: search + notifications (Phase 6). */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2">
            <SearchBar workspace={ws.data} />
            <NotificationBell workspaceSlug={ws.data.slug} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet context={{ workspace: ws.data }} />
          </div>
        </main>
      </RealtimeProvider>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-6 w-6 text-[var(--color-fg-muted)]" />
    </div>
  );
}
