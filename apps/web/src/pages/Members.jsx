import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, UserPlus, Crown, Shield, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Input, Alert } from '../components/ui/Field';
import { Button } from '../components/ui/Button';

const ROLE_ICON = {
  owner: Crown,
  admin: Shield,
  member: User,
  agent: User,
};

export function Members() {
  const { workspace } = useOutletContext();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [createdLink, setCreatedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const members = useQuery({
    queryKey: ['members', workspace.id],
    queryFn: () => api.get(`/workspaces/${workspace.id}/members`),
  });

  const invite = useMutation({
    mutationFn: (body) => api.post(`/workspaces/${workspace.id}/invites`, body),
    onSuccess: (data) => {
      setCreatedLink(data.link);
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['members', workspace.id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create invite'),
  });

  const onInvite = (e) => {
    e.preventDefault();
    setError(null);
    setCreatedLink(null);
    invite.mutate({ email, role });
  };

  const copyLink = async () => {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-bold">Members</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Invite teammates to <strong>{workspace.name}</strong>.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        {/* Invite form */}
        <form onSubmit={onInvite} className="space-y-3 border border-[var(--color-border)] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4" /> Invite someone
          </h2>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex gap-2">
            <Input
              type="email"
              required
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" loading={invite.isPending}>
              Invite
            </Button>
          </div>
          {createdLink && (
            <div className="flex items-center gap-2 border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{createdLink}</span>
              <Button variant="secondary" size="sm" onClick={copyLink}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </form>

        {/* Member list */}
        <div>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            {members.data?.items?.length ?? 0} member
            {(members.data?.items?.length ?? 0) === 1 ? '' : 's'}
          </h2>
          <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
            {(members.data?.items ?? []).map((m) => {
              const Icon = ROLE_ICON[m.role] ?? User;
              return (
                <li key={m.actorId} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center border border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-xs font-semibold">
                    {(m.name || m.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name || m.email}</div>
                    {m.email && m.name && (
                      <div className="truncate text-xs text-[var(--color-fg-muted)]">{m.email}</div>
                    )}
                  </div>
                  <span className="flex items-center gap-1 font-mono text-xs capitalize text-[var(--color-fg-muted)]">
                    <Icon className="h-3 w-3" />
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
