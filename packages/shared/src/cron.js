/**
 * Minimal 5-field cron matcher (PLAN.md §2 #4 — scheduled tasks). Pure + tiny
 * so the scheduler logic is unit-testable without pg-boss or a cron dependency.
 * Supports wildcards, comma lists, ranges, and steps (e.g. every 15 minutes, or
 * 0 through 10 step 2). Minute resolution — enough for "every weekday at 09:00"
 * style agent schedules.
 *
 * `cronDue(expr, now, lastFiredAt)` returns true when now's minute matches the
 * expression AND it's a later minute than the last fire (so a tick won't double-
 * fire within the same minute).
 */

// Parse a single field: wildcard, comma list, range, or step (e.g. star/15).
function parseField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(',')) {
    const [rangeRaw, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step: ${field}`);
    let lo, hi;
    if (rangeRaw === '*') {
      lo = min;
      hi = max;
    } else if (rangeRaw.includes('-')) {
      const [a, b] = rangeRaw.split('-').map(Number);
      if (![a, b].every(Number.isInteger)) throw new Error(`bad cron range: ${field}`);
      lo = a;
      hi = b;
    } else if (rangeRaw === '' && stepRaw) {
      // "*/n" already handled; bare "/n" not valid
      throw new Error(`bad cron field: ${field}`);
    } else {
      const v = Number(rangeRaw);
      if (!Number.isInteger(v)) throw new Error(`bad cron value: ${field}`);
      if (stepRaw) {
        lo = v;
        hi = max;
      } else {
        out.add(v);
        continue;
      }
    }
    for (let v = lo; v <= hi; v += step) {
      if (v < min || v > max) continue;
      out.add(v);
    }
  }
  return out;
}

/** Validate + parse a 5-field cron expression into matching sets. */
export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron must have 5 fields: ${expr}`);
  const [m, h, dom, mon, dow] = parts;
  return {
    minute: parseField(m, 0, 59),
    hour: parseField(h, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(mon, 1, 12),
    dow: parseField(dow, 0, 6), // 0 = Sunday
  };
}

/** True if the cron expression matches the given Date's minute. */
export function cronMatches(expr, date) {
  const c = parseCron(expr);
  const domOk = c.dom.has(date.getDate());
  const dowOk = c.dow.has(date.getDay());
  // POSIX rule: if both dom and dow are restricted, either matching is enough;
  // if one is a wildcard (all values), the other must match. We approximate:
  // when both are restricted, accept if EITHER matches.
  const dayOk = c.dom.size === 31 || c.dow.size === 7 ? domOk && dowOk : domOk || dowOk;
  return (
    c.minute.has(date.getMinutes()) &&
    c.hour.has(date.getHours()) &&
    c.month.has(date.getMonth() + 1) &&
    dayOk
  );
}

/**
 * Should a task with this schedule fire now? Matches the minute AND ensures we
 * don't re-fire within the same minute as the last fire.
 * @param {string} expr cron
 * @param {Date} now
 * @param {Date|null} lastFiredAt
 */
export function cronDue(expr, now, lastFiredAt) {
  if (!cronMatches(expr, now)) return false;
  if (!lastFiredAt) return true;
  // Truncate both to the minute; only fire if now's minute is strictly after.
  const nm = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
  );
  const lm = new Date(
    lastFiredAt.getFullYear(),
    lastFiredAt.getMonth(),
    lastFiredAt.getDate(),
    lastFiredAt.getHours(),
    lastFiredAt.getMinutes(),
  );
  return nm.getTime() > lm.getTime();
}
