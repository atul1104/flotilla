import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthProvider';
import { api, ApiError } from '../lib/api';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { Field, Input, Alert } from '../components/ui/Field';

export function WorkspacePicker() {
  const { isAuthenticated, isLoading, workspaces } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const create = useMutation({
    mutationFn: (body) => api.post('/workspaces', body),
    onSuccess: (ws) => {
      window.location.href = `/${ws.slug}`;
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // If exactly one workspace, jump straight in.
  if (!creating && workspaces.length === 1) {
    return <Navigate to={`/${workspaces[0].slug}`} replace />;
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Logo className="h-6 w-6" />
        <span className="font-mono text-lg font-bold">flotilla</span>
      </div>

      {workspaces.length > 0 && (
        <>
          <h1 className="text-lg font-bold">Your workspaces</h1>
          <ul className="mt-4 divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/${w.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-bg-subtle)]"
                >
                  <span>
                    <span className="block text-sm font-medium">{w.name}</span>
                    <span className="font-mono text-xs text-[var(--color-fg-muted)]">
                      #{w.slug}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-[var(--color-brand)]">open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 border border-[var(--color-border)] p-5">
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name });
            }}
            className="space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> New workspace
            </h2>
            {error && <Alert kind="error">{error}</Alert>}
            <Field label="Workspace name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Button type="submit" loading={create.isPending} className="w-full">
              Create
            </Button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs text-[var(--color-fg-muted)] underline"
            >
              Cancel
            </button>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => setCreating(true)} className="w-full">
            <Plus className="h-4 w-4" /> Create a workspace
          </Button>
        )}
      </div>
    </div>
  );
}
