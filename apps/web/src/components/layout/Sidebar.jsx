import { NavLink } from 'react-router-dom';
import {
  Home,
  Users,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  Hash,
  Lock,
  CheckSquare,
  Bot,
  Activity as ActivityIcon,
  BarChart3,
  Search as SearchIcon,
} from 'lucide-react';
import { Logo } from '../Logo';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthProvider';
import { useUiStore } from '../../store/uiStore';
import { useChannels } from '../../hooks/api';

export function Sidebar({ workspace }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useUiStore();
  const channels = useChannels(workspace.id);

  const publicCh = (channels.data?.items ?? []).filter((c) => c.kind === 'public');
  const privateCh = (channels.data?.items ?? []).filter((c) => c.kind === 'private');
  const dms = (channels.data?.items ?? []).filter((c) => c.kind === 'dm');

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <Logo className="h-5 w-5 text-[var(--color-fg)]" />
        <span className="font-mono text-sm font-bold tracking-tight">flotilla</span>
      </div>

      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          Workspace
        </div>
        <div className="truncate text-sm font-semibold">{workspace.name}</div>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto p-2">
        <NavLink
          to="."
          end
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
              isActive
                ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
            }`
          }
        >
          <Home className="h-4 w-4" /> Home
        </NavLink>

        <ChannelGroup label="Channels" channels={publicCh} />
        <ChannelGroup label="Private" channels={privateCh} locked />
        <ChannelGroup label="Direct messages" channels={dms} />

        <div className="pt-2">
          <NavLink
            to="tasks"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <CheckSquare className="h-4 w-4" /> Tasks
          </NavLink>
          <NavLink
            to="agents"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <Bot className="h-4 w-4" /> Agents
          </NavLink>
          <NavLink
            to="activity"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <ActivityIcon className="h-4 w-4" /> Activity
          </NavLink>
          <NavLink
            to="usage"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <BarChart3 className="h-4 w-4" /> Usage
          </NavLink>
          <NavLink
            to="search"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <SearchIcon className="h-4 w-4" /> Search
          </NavLink>
          <NavLink
            to="members"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <Users className="h-4 w-4" /> Members
          </NavLink>
          <NavLink
            to="settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-1.5 text-sm ${
                isActive
                  ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
              }`
            }
          >
            <SettingsIcon className="h-4 w-4" /> Settings
          </NavLink>
        </div>
      </nav>

      <div className="space-y-2 border-t border-[var(--color-border)] p-3">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-[var(--color-bg)]"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-[var(--color-fg-muted)]">{user?.email}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function ChannelGroup({ label, channels, locked }) {
  if (!channels.length) return null;
  return (
    <div className="pt-2">
      <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        {label}
      </div>
      {channels.map((c) => (
        <NavLink
          key={c.id}
          to={`channels/${c.id}`}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-2 py-1 text-sm ${
              isActive
                ? 'border-l-2 border-[var(--color-brand)] bg-[var(--color-bg)] font-medium'
                : 'border-l-2 border-transparent hover:bg-[var(--color-bg)]'
            }`
          }
          title={c.topic || c.name}
        >
          {locked ? <Lock className="h-3 w-3 shrink-0" /> : <Hash className="h-3 w-3 shrink-0" />}
          <span className="truncate">{c.name}</span>
          {c.unreadCount > 0 && (
            <span className="ml-auto bg-[var(--color-brand)] px-1.5 font-mono text-[10px] text-white">
              {c.unreadCount > 99 ? '99+' : c.unreadCount}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}
