/** Prisma client singleton (avoids exhausting connections in dev hot reload). */
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__flotillaPrisma ??
  new PrismaClient({
    log: config.isDev
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
      : ['error', 'warn'],
  });

if (config.isDev) {
  prisma.$on('query', (e) => {
    if (e.duration > 200) logger.warn({ sql: e.query, ms: e.duration }, 'slow query');
  });
}

if (!config.isTest) globalForPrisma.__flotillaPrisma = prisma;
