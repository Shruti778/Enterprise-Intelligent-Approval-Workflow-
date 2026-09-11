import { Department, Role, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { RoleName, AUDIT_ACTIONS } from '../types/domain';
import * as auditService from './auditService';

export interface AuthenticatedUserDto {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  department: string | null;
  departmentId: number | null;
  status: string;
}

export function toUserDto(user: User): AuthenticatedUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role?.name ?? 'EMPLOYEE') as RoleName,
    department: user.department?.name ?? null,
    departmentId: user.departmentId ?? null,
    status: user.status,
  };
}

export async function login(email: string, password: string) {
  const user = await User.scope('withPassword').findOne({
    where: { email: email.toLowerCase().trim() },
    include: [
      { model: Role, as: 'role' },
      { model: Department, as: 'department' },
    ],
  });

  // Same message for unknown email and wrong password: do not leak which accounts exist.
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const passwordMatches = await comparePassword(password, user.passwordHash);
  if (!passwordMatches) throw ApiError.unauthorized('Invalid email or password');

  if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account is inactive');

  const dto = toUserDto(user);
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: dto.role,
    departmentId: user.departmentId ?? null,
  });

  await auditService.record({
    userId: user.id,
    action: AUDIT_ACTIONS.USER_LOGIN,
    entityType: 'USER',
    entityId: user.id,
    metadata: { email: user.email },
  });

  return { token, user: dto };
}

export async function getProfile(userId: number) {
  const user = await User.findByPk(userId, {
    include: [
      { model: Role, as: 'role' },
      { model: Department, as: 'department' },
    ],
  });
  if (!user) throw ApiError.notFound('User not found');
  return toUserDto(user);
}
