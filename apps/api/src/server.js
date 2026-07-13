/**
 * Server bootstrap: load env, verify infra, listen, handle graceful shutdown.
 */
import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/db.js';
import { pool } from './lib/pool.js';
import { verifyMailer } from './lib/mailer.js';
import { initRealtime } from './realtime/index.js';
import { initBoss, stopBoss } from './lib/boss.js';
import { initSentry } from './lib/sentry.js';

async function boot() {
  initSentry(); // Phase 8 — no-op without SENTRY_DSN.
  const app = createApp();

  // Verify infra connectivity (non-fatal warnings; tests boot without it).
  if (!config.isTest) {
    try {
      await prisma.$connect();
      logger.info('database connected');
    } catch (err) {
      logger.error({ err }, 'database connection failed — continuing (run `npm run db:up`)');
    }
    const mailOk = await verifyMailer();
    logger.info({ mailer: mailOk ? 'ok' : 'unreachable' }, 'mailer status');
  }

  const server = app.listen(config.PORT, () => {
    logger.info(`Flotilla API listening on http://localhost:${config.PORT} [${config.NODE_ENV}]`);
  });

  // Realtime (/client namespace). /daemon namespace added in Phase 4.
  if (!config.isTest) {
    initRealtime(server, config.APP_ORIGIN);
    logger.info('realtime /client namespace attached');
    // Job queue + cron schedules (Phase 6). Non-fatal if it can't start.
    initBoss().catch((err) => logger.warn({ err }, 'pg-boss failed to start — jobs disabled'));
  }

  // Graceful shutdown: stop accepting connections, drain, close pools.
  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    await stopBoss().catch(() => {});
    server.close(async () => {
      try {
        await prisma.$disconnect();
        await pool.end();
      } catch (err) {
        logger.error({ err }, 'error during shutdown');
      }
      process.exit(0);
    });
    // Force-exit if something hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Only boot when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    logger.error({ err }, 'fatal boot error');
    process.exit(1);
  });
}

export { boot };
