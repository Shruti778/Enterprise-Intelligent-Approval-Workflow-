import jwt from 'jsonwebtoken';
import { api, asUser } from '../helpers/api';
import { actorFor, SEED_PASSWORD, TestActor } from '../helpers/users';

describe('POST /api/auth/login', () => {
  let employee: TestActor;

  beforeAll(async () => {
    employee = await actorFor('EMPLOYEE');
  });

  it('signs in a user with valid credentials and returns their profile', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: employee.email, password: SEED_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toMatchObject({
      id: employee.id,
      email: employee.email,
      role: 'EMPLOYEE',
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('returns a usable JWT carrying the signed-in role', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: employee.email, password: SEED_PASSWORD });

    const token = response.body.data.token;
    expect(typeof token).toBe('string');
    expect(jwt.decode(token)).toMatchObject({ sub: employee.id, role: 'EMPLOYEE' });

    const profile = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe(employee.email);
  });

  it('rejects a wrong password', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: employee.email, password: 'not-the-password' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('rejects an unknown user with the same message as a wrong password', async () => {
    const unknown = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@company.com', password: SEED_PASSWORD });
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: employee.email, password: 'not-the-password' });

    expect(unknown.status).toBe(401);
    // Identical wording keeps the endpoint from revealing which accounts exist.
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('reports a validation error when credentials are missing', async () => {
    const response = await api().post('/api/auth/login').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('reports a validation error for a malformed email', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: SEED_PASSWORD });

    expect(response.status).toBe(400);
  });
});

describe('Protected routes', () => {
  it('rejects a request with no Authorization header', async () => {
    const response = await api().get('/api/requests');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed Authorization header', async () => {
    const response = await api().get('/api/requests').set('Authorization', 'Token abc123');

    expect(response.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 1, email: 'x@y.com', role: 'ADMIN' }, 'wrong-secret');

    const response = await api().get('/api/requests').set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { sub: 1, email: 'x@y.com', role: 'EMPLOYEE' },
      process.env.JWT_SECRET as string,
      { expiresIn: '-1h' }
    );

    const response = await api().get('/api/requests').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
  });

  it('accepts a valid token', async () => {
    const employee = await actorFor('EMPLOYEE');

    const response = await asUser(employee).get('/api/requests');

    expect(response.status).toBe(200);
  });
});
