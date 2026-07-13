/**
 * Mock runtime adapter (PLAN.md §8.3, §13). Produces a scripted stream of run
 * events + a final message so the full dispatch→stream→reply loop works
 * end-to-end WITHOUT any AI keys. The real claude-code adapter lives in
 * ./claude-code.js.
 *
 * Adapter contract (PLAN.md §8.3, Phase 5):
 *   startRun({ agentDir, systemPrompt, context, model, approvalPolicy,
 *             onEvent, postMessage, requestApproval }) →
 *     { cancel(), done: Promise, status(): 'succeeded'|'failed'|'cancelled',
 *       usage(): { tokensIn, tokensOut } }
 *
 * The daemon owns event seq; adapters just call onEvent({ type, payload }).
 *
 * Opt-in Phase 5 behaviors are triggered by markers in the trigger text so the
 * default hello-world run (Phase 4) is unchanged, but a `flotilla-daemon start`
 * demo can exercise artifacts, agent→agent handoffs, and approval gates.
 */
import { ensureAgentHome } from '../memory.js';

const SAMPLE_DIFF = `--- a/src/calc.js
+++ b/src/calc.js
@@ -1,3 +1,7 @@
 export function add(a, b) {
-  return a - b;
+  return a + b;
 }
+
+export function multiply(a, b) {
+  return a * b;
+}`;

export function startMockRun({ agentDir, context, onEvent, postMessage, requestApproval }) {
  ensureAgentHome(agentDir);
  let finalStatus = 'succeeded';
  const emit = (type, payload) => onEvent({ type, payload });

  const done = (async () => {
    try {
      emit('status', { status: 'running' });
      emit('thinking', { text: 'Reading the request…' });
      await delay(200);

      const trigger = String(context?.trigger ?? '');
      const wantsArtifact = /\[artifact\]|write (some )?code|implement/i.test(trigger);
      const handoffTo = (trigger.match(/@([a-z0-9_-]+)/i) || [])[1];
      const wantsApproval = /\[approve\]|run (the )?tests|needs approval/i.test(trigger);

      const reply = [
        `👋 I'm a **mock agent** (no real model wired). You said:`,
        '',
        `> ${trigger.slice(0, 280) || '(no context)'}`,
        '',
        'The real `claude-code` adapter runs in this slot in production — same contract, real replies streamed from your own machine.',
      ].join('\n');
      emit('chunk', { text: reply });
      await postMessage(reply);

      // Improvement #6 — inline artifact review (code diff rendered in-thread).
      if (wantsArtifact) {
        await postMessage('Here are my changes:', {
          type: 'artifact',
          artifactType: 'diff',
          title: 'calc.js — fix add() + add multiply()',
          language: 'javascript',
          content: SAMPLE_DIFF,
        });
      }

      // Improvement #3 — human-in-the-loop approval gate before a risky action.
      if (wantsApproval && requestApproval) {
        const decision = await requestApproval({
          action: 'run tests',
          label: 'npm test',
          risk: 'medium',
        });
        if (decision !== 'approved') {
          await postMessage(`🛑 Approval ${decision || 'denied'} — skipping tests.`);
          finalStatus = 'cancelled';
          return;
        }
        await postMessage('✅ Approved — tests pass.');
      }

      // §8.4 handoff — mention another agent; the server triggers its run.
      if (handoffTo && handoffTo !== context?.agent?.handle) {
        await postMessage(
          `Done on my end. @${handoffTo} would you review this when you have a moment?`,
        );
      }

      emit('final', {});
    } catch {
      finalStatus = 'failed';
      emit('status', { status: 'failed' });
    }
  })();

  return {
    cancel: () => {
      finalStatus = 'cancelled';
    },
    done,
    status: () => finalStatus,
    usage: () => ({ tokensIn: 42, tokensOut: 86 }),
  };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
