/**
 * Express 5 app composition. App is exported separately from server bootstrap
 * so Supertest can mount it without binding a port (PLAN.md §13).
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { config } from './config.js';
import { sessionMiddleware } from './lib/session.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './middleware/notFound.js';
import { router as healthRouter } from './modules/health/router.js';
import { router as authRouter } from './modules/auth/router.js';
import { router as workspacesRouter, invitesRouter } from './modules/workspaces/router.js';
import { router as channelsRouter } from './modules/channels/router.js';
import { router as messagesRouter } from './modules/messages/router.js';
import { router as uploadsRouter } from './modules/uploads/router.js';
import { router as tasksRouter } from './modules/tasks/router.js';
import { router as computersRouter } from './modules/computers/router.js';
import { router as agentsRouter } from './modules/agents/router.js';
import { router as runsRouter } from './modules/runs/router.js';
import { router as notificationsRouter } from './modules/notifications/router.js';
import { router as pushRouter } from './modules/push/router.js';
import { router as searchRouter } from './modules/search/router.js';
import { router as usageRouter } from './modules/usage/router.js';
import { router as agentTeamsRouter } from './modules/agent-teams/router.js';

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the built web SPA lives (Option A: single-origin deploy, PLAN §14).
// Override with WEB_DIST_DIR if a host serves it elsewhere; absent in dev/tests
// (the Vite dev server serves the SPA separately), so serving is gated on it
// existing.
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST_DIR || join(__dirname, '..', '..', 'web', 'dist');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.enable('trust proxy', 1);

  // --- security & infra ---
  // CSP (PLAN.md §11). In prod, allow the app origin + API + Socket.IO ws.
  const csp = config.isProd
    ? {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': [
              "'self'",
              config.APP_ORIGIN,
              `ws://${new URL(config.APP_ORIGIN).host}`,
              `wss://${new URL(config.APP_ORIGIN).host}`,
            ],
            'img-src': ["'self'", 'data:', 'blob:'],
            'style-src': ["'self'", "'unsafe-inline'"],
            'script-src': ["'self'"],
          },
        },
      }
    : { contentSecurityPolicy: false };
  app.use(helmet(csp));
  app.use(
    cors({
      origin: config.APP_ORIGIN,
      credentials: true, // cookies
    }),
  );
  app.use(compression());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // CSRF (PLAN.md §11): mutations must be JSON. A cross-origin form POST can't
  // set content-type: application/json, so this + SameSite=Lax cookies close the
  // CSRF surface. Daemon token-auth (Authorization header) is unaffected.
  app.use((req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.path.startsWith('/api/v1')) {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct && !ct.startsWith('application/json')) {
        return res.status(415).json({ error: 'Unsupported media type', code: 'UNSUPPORTED_MEDIA' });
      }
    }
    next();
  });

  // --- sessions (before routes that need auth) ---
  app.use(sessionMiddleware());

  // --- routes ---
  app.use(healthRouter);

  // v1 API mount point; modules register here as they're built.
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/workspaces', workspacesRouter);
  app.use('/api/v1/invites', invitesRouter);
  app.use('/api/v1', channelsRouter);
  app.use('/api/v1', messagesRouter);
  app.use('/api/v1', uploadsRouter);
  app.use('/api/v1', tasksRouter);
  app.use('/api/v1', computersRouter);
  app.use('/api/v1', agentsRouter);
  app.use('/api/v1', runsRouter);
  app.use('/api/v1', notificationsRouter);
  app.use('/api/v1', pushRouter);
  app.use('/api/v1', searchRouter);
  app.use('/api/v1', usageRouter);
  app.use('/api/v1', agentTeamsRouter);

  // --- web SPA (Option A: API serves the built single-origin web app) ---
  // Mounted AFTER the API routes so it never shadows them. Static assets are
  // served from the build; any other non-API GET falls back to index.html so
  // client-side routing works. /api/* and /socket.io fall through to the JSON
  // 404 handler (Socket.IO itself is bound to the http server, not Express).
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { immutable: true, maxAge: '1y', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(join(WEB_DIST, 'index.html'));
    });
  }

  // --- error handling (last) ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
