import { useState } from 'react';
import { Button } from '../ui/Button';
import { Field, Input, Alert } from '../ui/Field';
import { useMembers } from '../../hooks/api';

export function CreateTaskDialog({ workspaceId, channelId, onClose, onCreate }) {
  const members = useMembers(workspaceId);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    priority: 2,
    channelId: channelId || '',
    cron: '',
    tz: '',
  });
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Title is required');
    setError(null);
    const schedule = form.cron.trim()
      ? { cron: form.cron.trim(), ...(form.tz.trim() ? { tz: form.tz.trim() } : {}) }
      : null;
    onCreate({
      title: form.title,
      description: form.description || undefined,
      assigneeId: form.assigneeId || undefined,
      priority: Number(form.priority),
      channelId: form.channelId || undefined,
      schedule,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-bold">New task</h2>
        {error && <Alert kind="error">{error}</Alert>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="w-full resize-none border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignee">
              <select
                className="w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {(members.data?.items ?? []).map((m) => (
                  <option key={m.actorId} value={m.actorId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className="w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {[0, 1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    P{p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Schedule (cron)"
            hint="5-field cron, e.g. “0 9 * * 1-5” = weekdays at 9am. Leave blank for a one-off task."
          >
            <Input
              value={form.cron}
              onChange={(e) => setForm({ ...form, cron: e.target.value })}
              placeholder="0 9 * * 1-5"
            />
          </Field>
          {form.cron.trim() && (
            <Field
              label="Time zone"
              hint="IANA tz, e.g. America/New_York. Defaults to server local."
            >
              <Input
                value={form.tz}
                onChange={(e) => setForm({ ...form, tz: e.target.value })}
                placeholder="America/New_York"
              />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Create task</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
