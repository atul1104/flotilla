import { NotFoundError } from '@atul1104/shared';

export function notFound(req, _res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
