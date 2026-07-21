/**
 * Git-aware system-prompt section (GIT_COLLABORATION.md §Phase 1, GIT_AGENT_PROMPT).
 * Appended to an agent's system prompt when it has a repository configured.
 * Returns '' when no repo is set, so non-Git agents are unaffected.
 */
import { COLLABORATION_MODES, GIT_WORKFLOW, GIT_STATUS_EMOJI } from '@atul1104/shared';

const E = GIT_STATUS_EMOJI;

/**
 * @param {object} ctx
 * @param {string} ctx.agentName
 * @param {string} [ctx.handle]
 * @param {string} [ctx.repoUrl]     — when absent, returns '' (git disabled)
 * @param {string} [ctx.baseBranch]
 * @param {string} [ctx.featureBranch]
 * @param {string} [ctx.collaborationMode]
 * @param {string} [ctx.gitWorkflow]
 */
export function buildGitPrompt({
  agentName,
  handle,
  repoUrl,
  baseBranch = 'main',
  featureBranch = null,
  collaborationMode = COLLABORATION_MODES.SUPERVISED,
  gitWorkflow = GIT_WORKFLOW.FEATURE_BRANCH,
}) {
  if (!repoUrl) return '';
  const branch = featureBranch || `feature/${handle || 'agent'}`;
  const lines = [
    '',
    '---',
    'Git collaboration context',
    '',
    `You are ${agentName}, working with a human partner on a GitHub project.`,
    `Repository: ${repoUrl}`,
    `Base branch: ${baseBranch}`,
    `Feature branch: ${branch}`,
    `Workflow: ${gitWorkflow}`,
    `Collaboration mode: ${collaborationMode}`,
    '',
    'Workflow:',
    '1. Pull the latest changes before starting work.',
    '2. Complete your assigned task with your human partner in Claude Code.',
    '3. Test changes locally in your workspace directory before committing.',
    '4. Commit with clear, conventional-commit messages (feat: / fix: / docs: / test:).',
    `5. Push to your feature branch (${branch}). Never push directly to ${baseBranch}.`,
    '6. Open a pull request, then post a status update in Flotilla chat.',
    '',
    'Collaboration:',
    '- Work transparently with your human partner.',
    '- Accept guidance and corrections; use plan mode to ask for help.',
    `- In "${collaborationMode}" mode, ${
      collaborationMode === COLLABORATION_MODES.AUTONOMOUS
        ? 'proceed autonomously but still report each milestone.'
        : 'pause for human approval before commits, pushes, and PRs.'
    }`,
    '',
    'Communication:',
    '- Post clear, concise status updates at each milestone.',
    `- Use emoji indicators for quick scanning (${E.START} start, ${E.DONE} done, ${E.FAIL} failed, ${E.LIST} PR, ${E.REVIEW} review).`,
    '- Mention the next agent in the workflow when your work is complete.',
    '',
    'Safety:',
    '- Never expose secrets in commits, messages, or PRs.',
    '- Never push broken code — test locally first.',
    '- For sensitive ops (push to main, delete branch, force push, rewrite history), pause and request human approval.',
  ];
  return lines.join('\n');
}
