import { asUser } from '../helpers/api';
import { resetTransactionalData } from '../helpers/db';
import { highRiskLaptop } from '../helpers/fixtures';
import { actorFor, otherEmployee, TestActor } from '../helpers/users';
import { createAndSubmit, stepIdFor, stepStatuses } from '../helpers/workflow';

describe('Role-based authorization on approvals', () => {
  let employee: TestActor;
  let manager: TestActor;
  let finance: TestActor;
  let compliance: TestActor;
  let director: TestActor;
  let requestId: number;

  beforeAll(async () => {
    [employee, manager, finance, compliance, director] = await Promise.all([
      actorFor('EMPLOYEE'),
      actorFor('MANAGER'),
      actorFor('FINANCE'),
      actorFor('COMPLIANCE'),
      actorFor('DIRECTOR'),
    ]);
  });

  beforeEach(async () => {
    await resetTransactionalData();
    requestId = await createAndSubmit(employee, highRiskLaptop());
  });

  it('keeps employees out of the approvals area entirely', async () => {
    const pending = await asUser(employee).get('/api/approvals/pending');
    const approve = await asUser(employee)
      .post(`/api/approvals/${await stepIdFor(requestId, 'MANAGER')}/approve`)
      .send({});

    expect(pending.status).toBe(403);
    expect(approve.status).toBe(403);
    expect((await stepStatuses(requestId)).MANAGER).toBe('PENDING');
  });

  it('lets the Manager approve the step addressed to the MANAGER role', async () => {
    const response = await asUser(manager)
      .post(`/api/approvals/${await stepIdFor(requestId, 'MANAGER')}/approve`)
      .send({ comment: 'Approved.' });

    expect(response.status).toBe(200);
    expect((await stepStatuses(requestId)).MANAGER).toBe('APPROVED');
  });

  it('stops Finance from acting on a Manager step', async () => {
    const response = await asUser(finance)
      .post(`/api/approvals/${await stepIdFor(requestId, 'MANAGER')}/approve`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/MANAGER/);
    expect((await stepStatuses(requestId)).MANAGER).toBe('PENDING');
  });

  it('stops Compliance from acting on a Finance step', async () => {
    await asUser(manager).post(`/api/approvals/${await stepIdFor(requestId, 'MANAGER')}/approve`).send({});

    const response = await asUser(compliance)
      .post(`/api/approvals/${await stepIdFor(requestId, 'FINANCE')}/approve`)
      .send({});

    expect(response.status).toBe(403);
    expect((await stepStatuses(requestId)).FINANCE).toBe('PENDING');
  });

  it('lets the Director approve the Director step once it is reached', async () => {
    for (const actor of [manager, finance, compliance]) {
      await asUser(actor)
        .post(`/api/approvals/${await stepIdFor(requestId, actor.role)}/approve`)
        .send({});
    }

    const response = await asUser(director)
      .post(`/api/approvals/${await stepIdFor(requestId, 'DIRECTOR')}/approve`)
      .send({ comment: 'Signed off.' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('APPROVED');
  });

  it('stops an approver from rejecting a step that belongs to another role', async () => {
    const response = await asUser(director)
      .post(`/api/approvals/${await stepIdFor(requestId, 'MANAGER')}/reject`)
      .send({ comment: 'Not for me to decide.' });

    expect(response.status).toBe(403);
    expect((await stepStatuses(requestId)).MANAGER).toBe('PENDING');
  });

  it('shows each approver only the steps addressed to their own role', async () => {
    const managerQueue = await asUser(manager).get('/api/approvals/pending');
    const financeQueue = await asUser(finance).get('/api/approvals/pending');

    expect(managerQueue.body.data).toHaveLength(1);
    expect(managerQueue.body.data[0].approverRole).toBe('MANAGER');
    expect(managerQueue.body.data[0].request.id).toBe(requestId);
    // Finance has nothing to do until the Manager stage completes.
    expect(financeQueue.body.data).toHaveLength(0);
  });

  it('never lists an approver their own request, even when the role matches', async () => {
    const ownRequestId = await createAndSubmit(manager, highRiskLaptop());

    const queue = await asUser(manager).get('/api/approvals/pending');

    expect(queue.body.data.map((item: { request: { id: number } }) => item.request.id)).not.toContain(
      ownRequestId
    );
  });
});

describe('Role-based authorization on requests', () => {
  let employee: TestActor;
  let secondEmployee: TestActor;
  let admin: TestActor;
  let director: TestActor;
  let requestId: number;

  beforeAll(async () => {
    [employee, admin, director, secondEmployee] = await Promise.all([
      actorFor('EMPLOYEE'),
      actorFor('ADMIN'),
      actorFor('DIRECTOR'),
      otherEmployee(),
    ]);
  });

  beforeEach(async () => {
    await resetTransactionalData();
    requestId = await createAndSubmit(employee, highRiskLaptop());
  });

  it('hides another employee\'s request from an unrelated employee', async () => {
    const response = await asUser(secondEmployee).get(`/api/requests/${requestId}`);

    expect(response.status).toBe(403);
  });

  it('lets an approver in the request\'s workflow read it', async () => {
    const response = await asUser(director).get(`/api/requests/${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(requestId);
  });

  it('gives ADMIN visibility of every request', async () => {
    const response = await asUser(admin).get(`/api/requests/${requestId}`);

    expect(response.status).toBe(200);
  });

  it('limits an employee\'s request list to their own requests', async () => {
    await createAndSubmit(secondEmployee, highRiskLaptop());

    const response = await asUser(employee).get('/api/requests');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(requestId);
  });

  it('stops one user from submitting another user\'s request', async () => {
    const draft = await asUser(secondEmployee)
      .post('/api/requests')
      .send(highRiskLaptop());

    const response = await asUser(employee).post(`/api/requests/${draft.body.data.id}/submit`).send({});

    expect(response.status).toBe(403);
  });
});
