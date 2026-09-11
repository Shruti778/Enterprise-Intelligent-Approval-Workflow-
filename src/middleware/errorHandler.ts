import { NextFunction, Request, Response } from 'express';
import {
  ValidationError as SequelizeValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  DatabaseError,
} from 'sequelize';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A record with these values already exists';
    details = err.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof ForeignKeyConstraintError) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Referenced record does not exist';
  } else if (err instanceof SequelizeValidationError) {
    statusCode = 422;
    code = 'UNPROCESSABLE_ENTITY';
    message = 'Validation failed';
    details = err.errors.map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof DatabaseError) {
    statusCode = 400;
    code = 'DATABASE_ERROR';
    message = 'The database rejected this operation';
  } else if (err instanceof Error) {
    message = env.nodeEnv === 'production' ? message : err.message;
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}
