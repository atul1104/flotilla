import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AuthShell } from '../components/layout/AuthShell';
import { Alert } from '../components/ui/Field';
import { api } from '../lib/api';

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState('loading'); // loading | success | error

  useEffect(() => {
    if (!token) return setState('error');
    api
      .post('/auth/verify-email', { token })
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <AuthShell title="Verifying your email">
      {state === 'loading' && <Alert>Confirming…</Alert>}
      {state === 'success' && (
        <>
          <Alert kind="success">Your email is verified.</Alert>
          <Link to="/" className="mt-4 inline-block text-sm font-medium underline">
            Continue to your workspace →
          </Link>
        </>
      )}
      {state === 'error' && (
        <Alert kind="error">This verification link is invalid or expired.</Alert>
      )}
    </AuthShell>
  );
}
