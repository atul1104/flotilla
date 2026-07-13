/**
 * Session middleware. httpOnly + Secure (prod) + SameSite=Lax cookies, backed
 * by Postgres (connect-pg-simple). 30-day rolling (PLAN.md §11).
 *
 * The connect-pg-simple store creates the `session` table itself on first use;
 * we model it in Prisma too so schema stays the source of truth.
 */
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import { config } from '../config.js';
import { pool } from './pool.js';

const PostgresStore = ConnectPgSimple(session);

export function sessionMiddleware() {
  return session({
    store: new PostgresStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
      pruneSessionInterval: config.isTest ? false : 60,
    }),
    name: 'flotilla.sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh expiry on each request -> 30-day rolling
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    },
  });
}
