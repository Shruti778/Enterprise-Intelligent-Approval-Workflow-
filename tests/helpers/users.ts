import { Role, User } from '../../src/models';
import { signToken } from '../../src/utils/jwt';
import type { RoleName } from '../../src/types/domain';

export interface TestActor {
  id: number;
  role: RoleName;
  email: string;
  name: string;
  token: string;
}

const cache = new Map<RoleName, TestActor>();

/** The seeded account for a role, plus a ready-to-use bearer token. */
export async function actorFor(role: RoleName): Promise<TestActor> {
  const cached = cache.get(role);
  if (cached) return cached;

  const user = await User.findOne({ include: [{ model: Role, as: 'role', where: { name: role } }] });
  if (!user) throw new Error(`No seeded user with role ${role}`);

  const actor: TestActor = {
    id: user.id,
    role,
    email: user.email,
    name: user.name,
    token: signToken({ sub: user.id, email: user.email, role, departmentId: user.departmentId ?? null }),
  };

  cache.set(role, actor);
  return actor;
}

/** A second EMPLOYEE account, for "another user's request" scenarios. */
export async function otherEmployee(): Promise<TestActor> {
  const user = await User.findOne({ where: { email: 'employee2@company.com' } });
  if (!user) throw new Error('Seed user employee2@company.com not found');

  return {
    id: user.id,
    role: 'EMPLOYEE',
    email: user.email,
    name: user.name,
    token: signToken({
      sub: user.id,
      email: user.email,
      role: 'EMPLOYEE',
      departmentId: user.departmentId ?? null,
    }),
  };
}

export const SEED_PASSWORD = 'password123';
