/**
 * Zod validation middleware factories. Validate `body` / `query` / `params`
 * against a Zod schema; on failure throws a ValidationError (400) with details.
 */
import { ValidationError } from '@atul1104/shared';

function validatePart(schema, part) {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError('Validation failed', { issues }));
    }
    if (part === 'query') {
      // Express 5: req.query is a getter-only property — can't assign directly.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[part] = result.data;
    }
    next();
  };
}

export const validateBody = (schema) => validatePart(schema, 'body');
export const validateQuery = (schema) => validatePart(schema, 'query');
export const validateParams = (schema) => validatePart(schema, 'params');
