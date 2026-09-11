import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { RoleName } from '../types/domain';

/** Coarse role gate. Fine-grained per-step checks live in the approval service. */
export function authorize(...allowedRoles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowedRoles.length === 0 || allowedRoles.includes(req.user.role)) return next();
    return next(
      ApiError.forbidden(`This action requires one of: ${allowedRoles.join(', ')}`)
    );
  };
}

export const APPROVER_ROLES: RoleName[] = ['MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR', 'IT'];
