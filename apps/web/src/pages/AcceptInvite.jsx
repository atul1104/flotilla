import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AuthShell } from '../components/layout/AuthShell';
import { Field, Input, Alert } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthProvider';

export function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, refresh } = useAuth();
  const [form, setForm] = useState({ name: '', password: '' });
  const [error, setError] = useState(null);

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/invites/${token}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: (body) => api.post(`/invites/${token}/accept`, body),
  });

  const onAccept = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isAuthenticated) {
        await accept.mutateAsync({});
      } else {
        await accept.mutateAsync(form);
      }
      await refresh();
      if (preview.data?.workspaceSlug)
        navigate(`/${preview.data.workspaceSlug}`, { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept invite');
    }
  };

  if (preview.isLoading) return <AuthShell title="Loading invite…" />;
  if (preview.isError)
    return (
      <AuthShell title="Invite unavailable">
        <Alert kind="error">This invite is invalid, expired, or already used.</Alert>
      </AuthShell>
    );

  return (
    <AuthShell
      title={`Join ${preview.data?.workspaceName ?? 'a workspace'}`}
      subtitle={
        isAuthenticated
          ? 'Accept to join this workspace with your current account.'
          : 'Create an account to join.'
      }
    >
      <form onSubmit={onAccept} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {!isAuthenticated && (
          <>
            <Field label="Your name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Password" hint="At least 12 characters.">
              <Input
                type="password"
                required
                minLength={12}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          </>
        )}
        <Button type="submit" className="w-full" loading={accept.isPending}>
          {isAuthenticated ? 'Accept invite' : 'Join workspace'}
        </Button>
      </form>
      {!isAuthenticated && (
        <p className="mt-4 text-xs text-[var(--color-fg-muted)]">
          Already have an account?{' '}
          <a href="/login" className="underline">
            Sign in
          </a>{' '}
          first, then reopen the invite link.
        </p>
      )}
    </AuthShell>
  );
}
