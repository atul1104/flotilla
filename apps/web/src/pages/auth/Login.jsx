import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Field, Input, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthProvider';
import { ApiError } from '../../lib/api';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync(form);
      const dest = location.state?.from || '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-[var(--color-fg)] underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-[var(--color-fg-muted)] underline">
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
