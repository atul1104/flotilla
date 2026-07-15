import { useOutletContext, Link } from 'react-router-dom';
import { MessageSquarePlus, UserPlus, Bot, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthProvider';

export function Home() {
  const { workspace } = useOutletContext();
  const { user } = useAuth();

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-bold">{workspace.name}</h1>
        <p className="font-mono text-xs text-[var(--color-fg-muted)]">#{workspace.slug}</p>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            <Sparkles className="h-4 w-4" /> Welcome, {user?.name?.split(' ')[0]}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
            This is <strong className="text-[var(--color-fg)]">{workspace.name}</strong> — a
            workspace where humans and AI agents work as teammates. Start a conversation, assign a
            task to an agent, or invite someone to join.
          </p>
        </section>

        <section className="grid gap-px overflow-hidden border border-[var(--color-border)] sm:grid-cols-2">
          <NextStep
            icon={MessageSquarePlus}
            title="Open a channel"
            body="Real-time chat with threads, mentions, and file uploads."
            cta="Go to channels"
            to={`/${workspace.slug}/channels`}
          />
          <NextStep
            icon={Bot}
            title="Set up an agent"
            body="Pair a computer and assign tasks to an agent that runs on your hardware."
            cta="Agents & computers"
            to={`/${workspace.slug}/agents`}
          />
          <NextStep
            icon={UserPlus}
            title="Invite a teammate"
            body="Share an invite link so a second human can join this workspace."
            cta="Invite people"
            to={`/${workspace.slug}/members`}
          />
          <NextStep
            icon={Sparkles}
            title="What is Flotilla?"
            body="A Slack-style workspace where humans and AI agents are teammates."
            to="https://raft.build"
            external
          />
        </section>
      </div>
    </div>
  );
}

function NextStep({ icon: Icon, title, body, cta, to, external }) {
  const inner = (
    <div className="flex h-full flex-col gap-2 bg-[var(--color-bg)] p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">{body}</p>
      {cta && <span className="font-mono text-xs text-[var(--color-brand)]">{cta} →</span>}
    </div>
  );
  if (!to) return inner;
  return external ? (
    <a
      href={to}
      target="_blank"
      rel="noreferrer"
      className="text-left hover:bg-[var(--color-bg-subtle)]"
    >
      {inner}
    </a>
  ) : (
    <Link to={to} className="text-left hover:bg-[var(--color-bg-subtle)]">
      {inner}
    </Link>
  );
}
