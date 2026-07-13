/** pino logger. Pretty in dev, JSON in prod, silent in test. */
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from '../config.js';

const REDACT = {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.sessionSecret',
  ],
  censor: '[REDACTED]',
};

export const logger = config.isTest
  ? pino({ level: 'silent' }) // keep test output clean
  : pino({
      level: config.LOG_LEVEL,
      transport: config.isProd
        ? undefined
        : {
            target: 'pino/file',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname,req,res,responseTime',
              singleLine: false,
            },
          },
      redact: REDACT,
    });

/** Scrub bearer tokens out of invite URLs before they hit access logs. */
function scrubUrl(url = '') {
  return url.replace(/(\/api\/v1\/invites\/)[^/?]+/i, '$1[REDACTED]');
}

/** pino-http middleware bound to the logger (skips logging /health, scrubs tokens). */
export const httpLogger = () =>
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: {
      req(req) {
        const out = pino.stdSerializers.req(req);
        out.url = scrubUrl(out.url);
        return out;
      },
    },
  });
