/** Shared node-postgres Pool. Used by connect-pg-simple (sessions) and raw
 *  queries (FTS in Phase 6). Kept separate from Prisma. */
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.isTest ? 5 : 20,
});
