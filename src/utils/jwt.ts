import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { RoleName } from '../types/domain';

export interface AuthTokenPayload {
  sub: number;
  email: string;
  role: RoleName;
  departmentId: number | null;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt.secret) as unknown as AuthTokenPayload;
}
