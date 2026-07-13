/**
 * Web push (PLAN.md §15, improvement #8). Stores per-user push subscriptions
 * and sends notifications via the Web Push protocol (VAPID). Best-effort: dead
 * endpoints (410/404) are pruned; a missing VAPID config disables push silently.
 */
import webpush from 'web-push';
import { prisma } from '../../lib/db.js';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

let configured = false;
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY,
    );
    configured = true;
  } catch (err) {
    logger.warn({ err }, 'web-push VAPID setup failed — push disabled');
  }
}

export function isPushEnabled() {
  return configured;
}

export function getVapidPublicKey() {
  return config.VAPID_PUBLIC_KEY || null;
}

export async function subscribe(userId, { endpoint, keys } = {}) {
  // endpoint isn't uniquely constrained (a user may share an endpoint across
  // devices); find by (userId, endpoint) and create/update accordingly.
  const existing = await prisma.pushSubscription.findFirst({
    where: { userId, endpoint },
  });
  if (existing) {
    return prisma.pushSubscription.update({
      where: { id: existing.id },
      data: { p256dh: keys?.p256dh, auth: keys?.auth },
    });
  }
  return prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: keys?.p256dh, auth: keys?.auth },
  });
}

export async function unsubscribe(userId, endpoint) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

/**
 * Send a push to all of a user's subscriptions. Payload kept small (title,
 * body, url). Expired/invalid endpoints are pruned (410/404). Returns the count
 * successfully delivered.
 */
export async function sendPush(userId, { title, body, url, tag } = {}) {
  if (!configured) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return 0;
  const payload = JSON.stringify({ title, body, url, tag });
  let delivered = 0;
  const dead = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        delivered += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410)
          dead.push(s.id); // subscription gone
        else logger.debug({ err: err?.message, userId }, 'push send failed');
      }
    }),
  );
  if (dead.length)
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
  return delivered;
}
