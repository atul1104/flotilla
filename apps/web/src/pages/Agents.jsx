import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  FlaskConical,
  Cpu,
  Copy,
  Check,
  ChevronRight,
  RotateCcw,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field, Input, Alert } from '../components/ui/Field';
import {
  useAgents,
  useComputers,
  useAgentMutations,
  useAgentRuns,
  useRetryRun,
  useTeamTemplates,
  useCreateTeam,
} from '../hooks/api';
import { RUNTIME, APPROVAL_POLICY_KEYS } from '@flotilla/shared';

const POLICY_LABELS = {
  [APPROVAL_POLICY_KEYS.SHELL]: 'Shell commands',
  [APPROVAL_POLICY_KEYS.FILE_WRITE]: 'File writes',
  [APPROVAL_POLICY_KEYS.OUTSIDE_WORKSPACE]: 'Writes outside workspace',
  [APPROVAL_POLICY_KEYS.ALL_TOOLS]: 'All tool use',
};

const RUN_STATUS_TONE = {
  succeeded: 'text-[var(--color-success)]',
  failed: 'text-[var(--color-danger)]',
  cancelled: 'text-[var(--color-fg-muted)]',
  awaiting_approval: 'text-[var(--color-brand)]',
};

export function Agents() {
  const { workspace } = useOutletContext();
  const agents = useAgents(workspace.id);
  const computers = useComputers(workspace.id);
  const mut = useAgentMutations(workspace.id);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pairCode, setPairCode] = useState(null);
  const [pairServerUrl, setPairServerUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  const pairMutation = useMutation({
    mutationFn: () => api.post(`/workspaces/${workspace.id}/computers/pairing-code`),
    onSuccess: (data) => {
      setPairCode(data.code);
      setPairServerUrl(data.serverUrl);
    },
  });

  const copyCmd = (code) => {
    navigator.clipboard.writeText(
      `npx flotilla-daemon pair ${pairServerUrl ?? 'http://localhost:4000'} ${code}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Phase 6 — agent team templates (improvement #5).
  const templates = useTeamTemplates(workspace.id);
  const createTeam = useCreateTeam(workspace.id);
  const onlineComputers = (computers.data?.items ?? []).filter((c) => c.status === 'online');
  const [teamComputerId, setTeamComputerId] = useState(null);

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-bold">Agents & Computers</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Agents run on your own computers via the daemon. {`(claude-code runtime)`}
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        {/* Computers */}
        <section className="border border-[var(--color-border)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4" /> Computers
          </h2>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            Pair a machine: generate a code, then run the daemon CLI on that machine.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => pairMutation.mutate()}
              loading={pairMutation.isPending}
            >
              Generate pairing code
            </Button>
            {pairCode && (
              <div className="flex flex-1 items-center gap-2 border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1">
                <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  npx flotilla-daemon pair {pairServerUrl ?? 'http://localhost:4000'}{' '}
                  {pairCode.slice(0, 18)}…
                </code>
                <Button variant="ghost" size="sm" onClick={() => copyCmd(pairCode)}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
          <ul className="mt-3 divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
            {(computers.data?.items ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span
                  className={`h-2 w-2 ${c.status === 'online' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-fg-muted)]'}`}
                />
                <span className="flex-1">{c.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                  {c.platform}
                </span>
                <button
                  className="text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
                  onClick={() =>
                    api
                      .del(`/computers/${c.id}`)
                      .then(() => qc.invalidateQueries({ queryKey: ['computers', workspace.id] }))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(computers.data?.items ?? []).length === 0 && (
              <li className="px-3 py-3 text-center font-mono text-[10px] text-[var(--color-fg-muted)]">
                no computers paired
              </li>
            )}
          </ul>
        </section>

        {/* Team templates (Phase 6, improvement #5) */}
        <section className="border border-[var(--color-border)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Team templates
          </h2>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            One-click blueprints that create a pre-configured set of agents.
          </p>
          {onlineComputers.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-[var(--color-fg-muted)]">
                On computer
              </span>
              <select
                value={teamComputerId ?? ''}
                onChange={(e) => setTeamComputerId(e.target.value || null)}
                className="border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
              >
                <option value="">none</option>
                {onlineComputers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(templates.data?.items ?? []).map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 border border-[var(--color-border)] p-3"
              >
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-[var(--color-fg-muted)]">{t.description}</div>
                <div className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                  {t.agentCount} agent{t.agentCount === 1 ? '' : 's'}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={createTeam.isPending}
                  onClick={() =>
                    createTeam.mutate({ template: t.id, computerId: teamComputerId ?? undefined })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Create team
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Agents */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              {agents.data?.items?.length ?? 0} agent
              {(agents.data?.items?.length ?? 0) === 1 ? '' : 's'}
            </h2>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New agent
            </Button>
          </div>
          <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
            {(agents.data?.items ?? []).map((a) => (
              <AgentRow
                key={a.id}
                agent={a}
                workspaceId={workspace.id}
                onTest={() => mut.test.mutate(a.id)}
                testPending={mut.test.isPending}
                onRemove={() => mut.remove.mutate(a.id)}
              />
            ))}
            {(agents.data?.items ?? []).length === 0 && (
              <li className="px-4 py-8 text-center">
                <p className="text-sm text-[var(--color-fg-muted)]">No agents yet.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="h-4 w-4" /> Create your first agent
                </Button>
              </li>
            )}
          </ul>
        </section>
      </div>

      {creating && (
        <CreateAgentDialog
          workspaceId={workspace.id}
          computers={computers.data?.items ?? []}
          onClose={() => setCreating(false)}
          onCreate={(body) => mut.create.mutate(body, { onSuccess: () => setCreating(false) })}
          error={mut.create.error?.message}
        />
      )}
    </div>
  );
}

function CreateAgentDialog({ computers, onClose, onCreate, error }) {
  const [form, setForm] = useState({
    name: '',
    handle: '',
    tagline: '',
    runtime: RUNTIME.CLAUDE_CODE,
    systemPrompt: '',
    computerId: '',
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-bold">New agent</h2>
        {error && <Alert kind="error">{error}</Alert>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({
              name: form.name,
              handle: form.handle.toLowerCase(),
              tagline: form.tagline || undefined,
              runtime: form.runtime,
              systemPrompt: form.systemPrompt || undefined,
              computerId: form.computerId || undefined,
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Handle">
              <Input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="researcher"
                required
              />
            </Field>
          </div>
          <Field label="Tagline">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </Field>
          <Field label="System prompt">
            <textarea
              rows={3}
              className="w-full resize-none border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Runtime">
              <select
                className="w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                value={form.runtime}
                onChange={(e) => setForm({ ...form, runtime: e.target.value })}
              >
                <option value="claude-code">claude-code</option>
              </select>
            </Field>
            <Field label="Computer">
              <select
                className="w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                value={form.computerId}
                onChange={(e) => setForm({ ...form, computerId: e.target.value })}
              >
                <option value="">(none)</option>
                {computers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.status === 'online' ? '●' : '○'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Create agent</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Phase 5 — an agent row with an expandable panel for approval-policy toggles
 * (improvement #3) and recent run history with retry (PLAN.md §9.1).
 */
function AgentRow({ agent, workspaceId, onTest, testPending, onRemove }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const runs = useAgentRuns(workspaceId, open ? agent.id : null);
  const retry = useRetryRun();

  const togglePolicy = (key, value) =>
    api
      .patch(`/agents/${agent.id}`, { approvalPolicy: { [key]: value } })
      .then(() => qc.invalidateQueries({ queryKey: ['agents', workspaceId] }));

  return (
    <li className="px-4">
      <div className="flex items-center gap-3 py-3">
        <div className="flex h-8 w-8 items-center justify-center border border-[var(--color-border)] bg-[var(--color-bg-subtle)] font-mono text-xs">
          {agent.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {agent.name}{' '}
            <span className="font-mono text-[var(--color-fg-muted)]">@{agent.handle}</span>
          </div>
          {agent.tagline && (
            <div className="truncate text-xs text-[var(--color-fg-muted)]">{agent.tagline}</div>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase text-[var(--color-fg-muted)]">
          {agent.runtime}
        </span>
        <button
          className="p-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          title="Policy & run history"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <Button
          variant="ghost"
          size="sm"
          title="Fire a test run"
          onClick={onTest}
          loading={testPending}
        >
          <FlaskConical className="h-4 w-4" /> Test
        </Button>
        <button
          className="text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="grid gap-4 pb-4 sm:grid-cols-2">
          {/* Approval policy */}
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
              Approval gates
            </div>
            <div className="space-y-1.5">
              {Object.entries(POLICY_LABELS).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-brand)]"
                    checked={!!agent.approvalPolicy?.[key]}
                    onChange={(e) => togglePolicy(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[var(--color-fg-muted)]">
              When on, these actions pause the run and post an approve/deny card in the thread.
            </p>
          </div>

          {/* Recent runs + retry */}
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
              Recent runs
            </div>
            <ul className="space-y-1">
              {(runs.data?.items ?? []).slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`uppercase ${RUN_STATUS_TONE[r.status] || 'text-[var(--color-fg-muted)]'}`}
                  >
                    {r.status}
                  </span>
                  <span className="text-[var(--color-fg-muted)]">· {r.trigger}</span>
                  {r.chainDepth > 0 && (
                    <span className="text-[var(--color-fg-muted)]">· d{r.chainDepth}</span>
                  )}
                  {['succeeded', 'failed', 'cancelled'].includes(r.status) && (
                    <button
                      title="Retry run"
                      className="ml-auto text-[var(--color-fg-muted)] hover:text-[var(--color-brand)]"
                      onClick={() => retry.mutate(r.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
              {(runs.data?.items ?? []).length === 0 && (
                <li className="text-[10px] text-[var(--color-fg-muted)]">no runs yet</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}
