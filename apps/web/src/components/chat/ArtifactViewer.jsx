import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { FileCode, ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { ARTIFACT_TYPE } from '@atul1104/shared';

/**
 * Inline artifact review (improvement #6). Renders a structured payload
 * (artifactType: diff | code | markdown | image) in-thread instead of a raw
 * text dump, so humans can review code/docs side-by-side with the conversation.
 */
export function ArtifactViewer({ payload }) {
  const [open, setOpen] = useState(true);
  const { artifactType, title, language, content, url } = payload;

  return (
    <div className="mt-1.5 w-full max-w-2xl border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-1.5 text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileCode className="h-3.5 w-3.5 text-[var(--color-brand)]" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {title || `artifact · ${artifactType}`}
        </span>
        {(language || artifactType) && (
          <span className="font-mono text-[9px] uppercase text-[var(--color-fg-muted)]">
            {language || artifactType}
          </span>
        )}
      </button>

      {open && (
        <div className="overflow-x-auto">
          {artifactType === ARTIFACT_TYPE.DIFF && <DiffView diff={content} />}
          {artifactType === ARTIFACT_TYPE.CODE && (
            <pre className="p-3 font-mono text-[11px] leading-relaxed">
              <code>{content}</code>
            </pre>
          )}
          {artifactType === ARTIFACT_TYPE.MARKDOWN && (
            <div className="prose-chat p-3 text-sm">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content || ''}</ReactMarkdown>
            </div>
          )}
          {artifactType === ARTIFACT_TYPE.IMAGE && url && (
            <img src={url} alt={title || 'artifact'} className="max-w-full" />
          )}
          {artifactType === ARTIFACT_TYPE.IMAGE && !url && (
            <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-fg-muted)]">
              <ImageIcon className="h-3.5 w-3.5" /> image artifact (no preview)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Minimal unified-diff renderer: + lines green, - lines red, hunks muted. */
function DiffView({ diff }) {
  const lines = String(diff || '').split('\n');
  return (
    <pre className="font-mono text-[11px] leading-relaxed">
      <code>
        {lines.map((line, i) => {
          let cls = 'text-[var(--color-fg-muted)]';
          if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@'))
            cls = 'text-[var(--color-brand)]';
          else if (line.startsWith('+'))
            cls = 'bg-[var(--color-success)]/10 text-[var(--color-success)]';
          else if (line.startsWith('-'))
            cls = 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]';
          return (
            <span key={i} className={`block px-3 ${cls}`}>
              {line || ' '}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
