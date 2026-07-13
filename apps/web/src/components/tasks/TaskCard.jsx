import { Avatar } from '../Avatar';

const PRIORITY_LABEL = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
const PRIORITY_COLOR = {
  0: 'var(--color-danger)',
  1: 'var(--color-warning)',
};

export function TaskCard({ task, onClick, draggable = true, onDragStart, onDragEnd }) {
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, task)}
      onDragEnd={onDragEnd}
      className="group cursor-pointer border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 shrink-0 border px-1 font-mono text-[9px] uppercase"
          style={{
            borderColor: PRIORITY_COLOR[task.priority] || 'var(--color-border)',
            color: PRIORITY_COLOR[task.priority] || 'var(--color-fg-muted)',
          }}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm">{task.title}</span>
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--color-fg-muted)]">{task.description}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        {task.assignee ? (
          <span className="flex items-center gap-1">
            <Avatar name={task.assignee.name} size={18} />
            <span className="text-[11px] text-[var(--color-fg-muted)]">{task.assignee.name}</span>
          </span>
        ) : (
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">unassigned</span>
        )}
        {task.dueAt && (
          <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
            {new Date(task.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}
