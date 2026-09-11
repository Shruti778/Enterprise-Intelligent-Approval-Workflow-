import { NextFunction, Request, Response } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'body') req.body = parsed;
      else Object.defineProperty(req, source, { value: parsed, writable: true });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          ApiError.badRequest(
            'Validation failed',
            error.issues.map((issue) => ({
              field: issue.path.join('.') || source,
              message: issue.message,
            }))
          )
        );
      }
      return next(error);
    }
  };
}
