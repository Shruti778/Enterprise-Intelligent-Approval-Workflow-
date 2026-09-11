import supertest from 'supertest';
import { createApp } from '../../src/app';
import type { TestActor } from './users';

const app = createApp();

export const api = () => supertest(app);

/** Supertest request with the actor's bearer token already attached. */
export const asUser = (actor: TestActor) => ({
  get: (path: string) => api().get(path).set('Authorization', `Bearer ${actor.token}`),
  post: (path: string) => api().post(path).set('Authorization', `Bearer ${actor.token}`),
  patch: (path: string) => api().patch(path).set('Authorization', `Bearer ${actor.token}`),
});
