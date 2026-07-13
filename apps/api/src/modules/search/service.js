/**
 * Full-text search (PLAN.md §3 — Postgres FTS). Messages use the generated
 * search_tsv column + GIN index (ranked); tasks/files use ILIKE. Scoped to the
 * caller's workspace (tenant isolation).
 */
import { prisma } from '../../lib/db.js';

/** FTS over message content, ranked. Raw SQL — Prisma can't query tsvector. */
async function searchMessages(workspaceId, q) {
  const rows = await prisma.$queryRaw`
    SELECT m.id, m.channel_id AS "channelId", m.sender_id AS "senderId",
           LEFT(m.content, 240) AS preview, m.created_at AS "createdAt"
    FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE c.workspace_id = ${workspaceId}::uuid
      AND m.deleted_at IS NULL
      AND m.search_tsv @@ plainto_tsquery('simple', ${q})
    ORDER BY ts_rank(m.search_tsv, plainto_tsquery('simple', ${q})) DESC, m.created_at DESC
    LIMIT 20
  `;
  return rows.map((r) => ({
    type: 'message',
    id: r.id,
    channelId: r.channelId,
    preview: r.preview,
    createdAt: r.createdAt,
  }));
}

async function searchTasks(workspaceId, q) {
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return tasks.map((t) => ({
    type: 'task',
    id: t.id,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt,
  }));
}

async function searchFiles(workspaceId, q) {
  const files = await prisma.attachment.findMany({
    where: {
      filename: { contains: q, mode: 'insensitive' },
      message: { channel: { workspaceId } },
    },
    include: { message: { include: { channel: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return files.map((f) => ({
    type: 'file',
    id: f.id,
    filename: f.filename,
    channelId: f.message?.channelId ?? null,
    createdAt: f.createdAt,
  }));
}

export async function search(workspaceId, q, type) {
  if (type === 'messages') return { items: await searchMessages(workspaceId, q) };
  if (type === 'tasks') return { items: await searchTasks(workspaceId, q) };
  if (type === 'files') return { items: await searchFiles(workspaceId, q) };
  const [messages, tasks, files] = await Promise.all([
    searchMessages(workspaceId, q),
    searchTasks(workspaceId, q),
    searchFiles(workspaceId, q),
  ]);
  return { items: [...messages, ...tasks, ...files] };
}
