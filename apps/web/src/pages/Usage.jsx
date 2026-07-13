import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Coins, Cpu, Activity as ActivityIcon, Zap } from 'lucide-react';
import { useUsage } from '../hooks/api';
import { Button } from '../components/ui/Button';

const WINDOWS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(cents) {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}¢`;
}

/** Usage & cost dashboard (PLAN.md §2 #2, §15 — improvement #2). */
export function Usage() {
  const { workspace } = useOutletContext();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useUsage(workspace.id, days);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
        Loading usage…
      </div>
    );
  }

  const totals = data?.totals ?? { runs: 0, tokensIn: 0, tokensOut: 0, costCents: 0 };
  const byDay = (data?.byDay ?? []).map((d) => ({
    ...d,
    day: typeof d.day === 'string' ? d.day.slice(5) : d.day,
    tokens: Number(d.tokensIn) + Number(d.tokensOut),
  }));
  const byAgent = data?.byAgent ?? [];

  return (
    <div className="flex-1 overflow-auto">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-bold">Usage & cost</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Token spend, run counts, and estimated cost per agent.
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Window selector */}
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w.days}
              variant={days === w.days ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </Button>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--color-border)] sm:grid-cols-4">
          <Stat icon={ActivityIcon} label="Runs" value={fmtTokens(totals.runs)} />
          <Stat icon={Zap} label="Tokens in" value={fmtTokens(totals.tokensIn)} />
          <Stat icon={Cpu} label="Tokens out" value={fmtTokens(totals.tokensOut)} />
          <Stat icon={Coins} label="Est. cost" value={fmtCost(totals.costCents)} />
        </div>

        {/* Daily tokens chart */}
        <section className="border border-[var(--color-border)] p-5">
          <h2 className="mb-3 text-sm font-semibold">Tokens per day</h2>
          {byDay.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--color-fg-muted)" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="var(--color-fg-muted)"
                    tickFormatter={fmtTokens}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                    }}
                    formatter={(v) => fmtTokens(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="tokensIn"
                    name="In"
                    stroke="var(--color-brand)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="tokensOut"
                    name="Out"
                    stroke="var(--color-accent)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Daily cost chart */}
        <section className="border border-[var(--color-border)] p-5">
          <h2 className="mb-3 text-sm font-semibold">Cost per day</h2>
          {byDay.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--color-fg-muted)" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="var(--color-fg-muted)"
                    tickFormatter={fmtCost}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                    }}
                    formatter={(v) => fmtCost(Number(v))}
                  />
                  <Bar dataKey="costCents" fill="var(--color-accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Per-agent breakdown */}
        <section className="border border-[var(--color-border)] p-5">
          <h2 className="mb-3 text-sm font-semibold">Per agent</h2>
          {byAgent.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                  <th className="py-2">Agent</th>
                  <th className="py-2 text-right">Runs</th>
                  <th className="py-2 text-right">Tokens in</th>
                  <th className="py-2 text-right">Tokens out</th>
                  <th className="py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a) => (
                  <tr key={a.agentId} className="border-b border-[var(--color-border-soft)]">
                    <td className="py-2">
                      <span className="font-medium">{a.name}</span>
                      {a.handle && (
                        <span className="ml-1 font-mono text-xs text-[var(--color-fg-muted)]">
                          @{a.handle}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{a.runs}</td>
                    <td className="py-2 text-right font-mono">{fmtTokens(a.tokensIn)}</td>
                    <td className="py-2 text-right font-mono">{fmtTokens(a.tokensOut)}</td>
                    <td className="py-2 text-right font-mono">{fmtCost(a.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--color-bg)] p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-[var(--color-fg-muted)]">
      No usage in this window yet.
    </div>
  );
}
