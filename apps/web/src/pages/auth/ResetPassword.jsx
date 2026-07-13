import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Field, Input, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api, ApiError } from '../../lib/api';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    }
  };

  if (!token)
    return (
      <AuthShell title="Reset password">
        <Alert kind="error">Invalid reset link.</Alert>
      </AuthShell>
    );

  return (
    <AuthShell
      title="Set a new password"
      footer={
        <>
          <Link to="/login" className="underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="New password" hint="At least 12 characters.">
          <Input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full">
          Reset password
        </Button>
      </form>
    </AuthShell>
  );
}
