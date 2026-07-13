import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Field, Input, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    await api.post('/auth/forgot-password', { email }).catch(() => {});
    setSent(true); // always — never leak account existence
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert kind="success">
          If an account exists for that email, a reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
