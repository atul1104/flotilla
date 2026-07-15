/**
 * Agent team templates (improvement #5). One POST creates a pre-configured set
 * of agents (e.g. "dev team" = coder + reviewer + QA). Handle conflicts within
 * the workspace are resolved by suffixing (-2, -3, …) so re-applying a template
 * is idempotent-ish rather than erroring.
 */
import { AGENT_TEAM_TEMPLATES, NotFoundError } from '@flotila-org/shared';
import { prisma } from '../../lib/db.js';
import { createAgent } from '../agents/service.js';

export function listTeamTemplates() {
  return Object.values(AGENT_TEAM_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    agentCount: t.agents.length,
  }));
}

export async function createAgentTeam(
  workspaceId,
  createdBy,
  { template, computerId },
  { plan } = {},
) {
  const tpl = AGENT_TEAM_TEMPLATES[template];
  if (!tpl) throw new NotFoundError('Unknown team template');

  const created = [];
  for (const def of tpl.agents) {
    let handle = def.handle;
    let suffix = 1;
    while (
      await prisma.agent.findUnique({ where: { workspaceId_handle: { workspaceId, handle } } })
    ) {
      suffix += 1;
      handle = `${def.handle}-${suffix}`;
    }
    created.push(
      await createAgent(
        workspaceId,
        createdBy,
        {
          name: def.name,
          handle,
          tagline: def.tagline,
          systemPrompt: def.systemPrompt,
          runtime: def.runtime,
          computerId,
        },
        { plan },
      ),
    );
  }
  return { template: tpl.name, agents: created };
}
