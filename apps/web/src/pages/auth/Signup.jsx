import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Field, Input, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthProvider';
import { ApiError } from '../../lib/api';

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', workspaceName: '', password: '' });
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await signup.mutateAsync(form);
      // Server creates a workspace when workspaceName is provided.
      if (res?.workspace?.slug) navigate(`/${res.workspace.slug}`, { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign up failed');
    }
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="One human account creates your first workspace. Invite teammates next."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--color-fg)] underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Your name">
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Workspace name" hint="e.g. Acme — you can rename it later.">
          <Input
            required
            value={form.workspaceName}
            onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
          />
        </Field>
        <Field label="Password" hint="At least 12 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
