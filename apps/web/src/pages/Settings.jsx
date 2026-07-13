import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Field, Input, Alert } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthProvider';
import { useUiStore } from '../store/uiStore';
import { enablePush } from '../lib/push';

export function Settings() {
  const { workspace } = useOutletContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useUiStore();

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    avatarUrl: user?.avatarUrl ?? '',
  });
  const [wsName, setWsName] = useState(workspace.name);
  const [profileMsg, setProfileMsg] = useState(null);
  const [wsMsg, setWsMsg] = useState(null);

  useEffect(() => {
    setWsName(workspace.name);
  }, [workspace.name]);

  const updateProfile = useMutation({
    mutationFn: (body) => api.patch('/auth/me', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setProfileMsg({ kind: 'success', text: 'Profile updated' });
    },
    onError: (e) =>
      setProfileMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Failed' }),
  });

  const updateWorkspace = useMutation({
    mutationFn: (body) => api.patch(`/workspaces/${workspace.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspace.slug] });
      setWsMsg({ kind: 'success', text: 'Workspace updated' });
    },
    onError: (e) => setWsMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'Failed' }),
  });

  // Phase 6 — web push opt-in (improvement #8).
  const [pushState, setPushState] = useState('idle'); // idle | enabling | granted | denied | unsupported
  useEffect(() => {
    if (!('Notification' in window)) return setPushState('unsupported');
    if (Notification.permission === 'granted') setPushState('granted');
    if (Notification.permission === 'denied') setPushState('denied');
  }, []);
  const enableNotifications = async () => {
    setPushState('enabling');
    try {
      const sub = await enablePush();
      setPushState(sub ? 'granted' : 'denied');
    } catch {
      setPushState('denied');
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        {/* Profile */}
        <section className="space-y-3 border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold">Profile</h2>
          {profileMsg && <Alert kind={profileMsg.kind}>{profileMsg.text}</Alert>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile.mutate({
                name: profile.name,
                avatarUrl: profile.avatarUrl || null,
              });
            }}
            className="space-y-3"
          >
            <Field label="Name">
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </Field>
            <Field label="Avatar URL">
              <Input
                value={profile.avatarUrl}
                onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
              />
            </Field>
            <Button type="submit" loading={updateProfile.isPending}>
              Save profile
            </Button>
          </form>
        </section>

        {/* Workspace */}
        <section className="space-y-3 border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold">Workspace</h2>
          {wsMsg && <Alert kind={wsMsg.kind}>{wsMsg.text}</Alert>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateWorkspace.mutate({ name: wsName });
            }}
            className="space-y-3"
          >
            <Field label="Workspace name">
              <Input value={wsName} onChange={(e) => setWsName(e.target.value)} />
            </Field>
            <Field label="Slug">
              <Input value={workspace.slug} disabled className="opacity-60" />
            </Field>
            <Button type="submit" loading={updateWorkspace.isPending}>
              Save workspace
            </Button>
          </form>
        </section>

        {/* Notifications (Phase 6, improvement #8) */}
        <section className="space-y-3 border border-[var(--color-border)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4" /> Notifications
          </h2>
          <p className="text-xs text-[var(--color-fg-muted)]">
            Get a push on your phone/desktop when an agent needs approval or finishes a run.
          </p>
          {pushState === 'unsupported' && (
            <Alert kind="error">Push notifications aren’t supported in this browser.</Alert>
          )}
          {pushState === 'denied' && (
            <Alert kind="error">
              Permission denied. Enable notifications in your browser settings to receive pushes.
            </Alert>
          )}
          {pushState === 'granted' && <Alert kind="success">Push notifications enabled.</Alert>}
          {pushState !== 'granted' && pushState !== 'unsupported' && (
            <Button
              onClick={enableNotifications}
              loading={pushState === 'enabling'}
              disabled={pushState === 'denied'}
            >
              <BellOff className="h-4 w-4" /> Enable push notifications
            </Button>
          )}
        </section>

        {/* Appearance */}
        <section className="space-y-3 border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <div className="flex gap-2">
            {['light', 'dark'].map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 border px-3 py-2 text-sm capitalize ${
                  theme === t
                    ? 'border-[var(--color-brand)] bg-[var(--color-bg-subtle)] font-medium'
                    : 'border-[var(--color-border)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
