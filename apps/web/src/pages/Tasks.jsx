import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Columns, List as ListIcon, Clock } from 'lucide-react';
import { TASK_BOARD_COLUMNS, TASK_STATUS } from '@flotila-org/shared';
import { useTasks, useTaskMutations, useTaskEvents } from '../hooks/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Button';
import { TaskCard } from '../components/tasks/TaskCard';
import { CreateTaskDialog } from '../components/tasks/CreateTaskDialog';
import { Avatar } from '../components/Avatar';

const COLUMN_LABELS = {
  [TASK_STATUS.BACKLOG]: 'Backlog',
  [TASK_STATUS.CLAIMED]: 'Claimed',
  [TASK_STATUS.RUNNING]: 'Running',
  [TASK_STATUS.NEEDS_REVIEW]: 'Needs Review',
  [TASK_STATUS.DONE]: 'Done',
};

export function Tasks() {
  const { workspace } = useOutletContext();
  const tasks = useTasks(workspace.id);
  const mut = useTaskMutations(workspace.id);
  const [view, setView] = useState('board');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dragId, setDragId] = useState(null);

  const items = tasks.data?.items ?? [];

  const onDrop = (status) => {
    if (!dragId) return;
    const t = items.find((x) => x.id === dragId);
    if (t && t.status !== status) mut.update.mutate({ taskId: dragId, status });
    setDragId(null);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <h1 className="text-xl font-bold">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-[var(--color-border)]">
            <button
              onClick={() => setView('board')}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${view === 'board' ? 'bg-[var(--color-bg-subtle)] font-medium' : ''}`}
            >
              <Columns className="h-3.5 w-3.5" /> Board
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${view === 'list' ? 'bg-[var(--color-bg-subtle)] font-medium' : ''}`}
            >
              <ListIcon className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-6 w-6 text-[var(--color-fg-muted)]" />
        </div>
      ) : view === 'board' ? (
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {TASK_BOARD_COLUMNS.filter((c) => c !== TASK_STATUS.CANCELLED).map((col) => {
            const colTasks = items.filter((t) => t.status === col);
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col)}
                className="flex w-72 shrink-0 flex-col border border-[var(--color-border)] bg-[var(--color-bg-subtle)]"
              >
                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
                  <span className="font-mono text-xs uppercase tracking-wide">
                    {COLUMN_LABELS[col]}
                  </span>
                  <span className="font-mono text-xs text-[var(--color-fg-muted)]">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {colTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onClick={() => setSelected(t)}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragId(null)}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="px-2 py-4 text-center font-mono text-[10px] text-[var(--color-fg-muted)]">
                      drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
            {items.map((t) => (
              <li
                key={t.id}
                className="cursor-pointer hover:bg-[var(--color-bg-subtle)]"
                onClick={() => setSelected(t)}
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-fg-muted)]">
                    {COLUMN_LABELS[t.status]}
                  </span>
                  <span className="flex-1 text-sm">{t.title}</span>
                  {t.assignee && <Avatar name={t.assignee.name} size={18} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && (
        <CreateTaskDialog
          workspaceId={workspace.id}
          onClose={() => setCreating(false)}
          onCreate={(body) => {
            mut.create.mutate(body, { onSuccess: () => setCreating(false) });
          }}
        />
      )}

      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} mut={mut} />}
    </div>
  );
}

function TaskDetail({ task, onClose, mut }) {
  const events = useTaskEvents(task.id, true);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto border border-[var(--color-border)] bg-[var(--color-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] uppercase">
            {COLUMN_LABELS[task.status]}
          </span>
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
            P{task.priority}
          </span>
        </div>
        <h2 className="text-lg font-bold">{task.title}</h2>
        {task.description && <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>}
        {task.schedule?.cron && (
          <div className="mt-2 flex items-center gap-2 font-mono text-xs text-[var(--color-fg-muted)]">
            <Clock className="h-3 w-3" /> {task.schedule.cron}
            {task.schedule.tz && <span>· {task.schedule.tz}</span>}
            {task.schedule.lastFiredAt && (
              <span>· last fired {new Date(task.schedule.lastFiredAt).toLocaleString()}</span>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => mut.claim.mutate(task.id, { onSuccess: onClose })}>
            Claim
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => mut.complete.mutate(task.id, { onSuccess: onClose })}
          >
            Complete
          </Button>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
            Activity
          </h3>
          <ul className="space-y-1 text-xs">
            {(events.data?.items ?? []).map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="font-mono text-[var(--color-fg-muted)]">
                  {new Date(e.createdAt).toLocaleString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>{e.type.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 text-right">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
