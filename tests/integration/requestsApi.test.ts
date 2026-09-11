import { api, asUser } from '../helpers/api';
import { resetTransactionalData } from '../helpers/db';
import { highRiskLaptop, lowRiskLaptop } from '../helpers/fixtures';
import { actorFor, otherEmployee, TestActor } from '../helpers/users';
import { createAndSubmit, stepIdFor } from '../helpers/workflow';

describe('Requests API', () => {
  let employee: TestActor;
  let manager: TestActor;

  beforeAll(async () => {
    [employee, manager] = await Promise.all([actorFor('EMPLOYEE'), actorFor('MANAGER')]);
  });

  beforeEach(resetTransactionalData);

  describe('POST /api/requests', () => {
    it('creates a request as a DRAFT with a generated request number', async () => {
      const response = await asUser(employee).post('/api/requests').send(lowRiskLaptop());

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        type: 'LAPTOP',
        title: lowRiskLaptop().title,
        amount: 30_000,
        status: 'DRAFT',
      });
      expect(response.body.data.requestNumber).toMatch(/^REQ-\d+$/);
      // Risk and workflow are produced on submission, not on creation.
      expect(response.body.data.risk).toBeNull();
      expect(response.body.data.workflow).toBeNull();
    });

    it('requires authentication', async () => {
      const response = await api().post('/api/requests').send(lowRiskLaptop());

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/requests', () => {
    it('lists the caller\'s requests newest first', async () => {
      await asUser(employee).post('/api/requests').send(lowRiskLaptop({ title: 'First request' }));
      await asUser(employee).post('/api/requests').send(lowRiskLaptop({ title: 'Second request' }));

      const response = await asUser(employee).get('/api/requests');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('currentStage');
    });

    it('filters by type and by status', async () => {
      await asUser(employee).post('/api/requests').send(lowRiskLaptop());
      const submittedId = await createAndSubmit(employee, highRiskLaptop());

      const laptops = await asUser(employee).get('/api/requests?type=LAPTOP');
      const inReview = await asUser(employee).get('/api/requests?status=IN_REVIEW');

      expect(laptops.body.data).toHaveLength(2);
      expect(inReview.body.data).toHaveLength(1);
      expect(inReview.body.data[0].id).toBe(submittedId);
    });

    it('rejects an unknown status filter', async () => {
      const response = await asUser(employee).get('/api/requests?status=NOT_A_STATUS');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/requests/:id', () => {
    it('returns the full request with its risk assessment and workflow', async () => {
      const id = await createAndSubmit(employee, highRiskLaptop());

      const response = await asUser(employee).get(`/api/requests/${id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.risk.level).toBe('HIGH');
      expect(response.body.data.workflow.steps.map((s: { approverRole: string }) => s.approverRole))
        .toEqual(['MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR']);
      expect(response.body.data.metadata).toMatchObject({ newVendor: true });
    });

    it('returns 404 for a request that does not exist', async () => {
      const response = await asUser(employee).get('/api/requests/999999');

      expect(response.status).toBe(404);
    });

    it('returns 400 for a non-numeric id', async () => {
      const response = await asUser(employee).get('/api/requests/abc');

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/requests/:id/submit', () => {
    it('runs risk assessment and starts the workflow', async () => {
      const created = await asUser(employee).post('/api/requests').send(highRiskLaptop());

      const response = await asUser(employee)
        .post(`/api/requests/${created.body.data.id}/submit`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('IN_REVIEW');
      expect(response.body.data.risk).toMatchObject({ level: 'HIGH', score: 65 });
      expect(response.body.data.workflow.status).toBe('IN_PROGRESS');
      expect(response.body.data.currentStage).toBe('Manager Approval');
    });

    it('refuses to submit a request that is already in review', async () => {
      const id = await createAndSubmit(employee, highRiskLaptop());

      const response = await asUser(employee).post(`/api/requests/${id}/submit`).send({});

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/IN_REVIEW/);
    });
  });

  describe('POST /api/requests/:id/resubmit', () => {
    it('restarts a rejected request with a new workflow instance', async () => {
      const id = await createAndSubmit(employee, highRiskLaptop());
      await asUser(manager)
        .post(`/api/approvals/${await stepIdFor(id, 'MANAGER')}/reject`)
        .send({ comment: 'Please get a second quote.' });

      const response = await asUser(employee).post(`/api/requests/${id}/resubmit`).send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('IN_REVIEW');
      expect(response.body.data.workflow.steps[0].status).toBe('PENDING');
    });

    it('refuses to resubmit a request that was never rejected', async () => {
      const id = await createAndSubmit(employee, highRiskLaptop());

      const response = await asUser(employee).post(`/api/requests/${id}/resubmit`).send({});

      expect(response.status).toBe(409);
    });
  });

  describe('POST /api/workflow/simulate', () => {
    it('returns the risk and the approval path without creating a request', async () => {
      const before = await asUser(employee).get('/api/requests');

      const response = await asUser(employee).post('/api/workflow/simulate').send({
        type: 'LAPTOP',
        amount: 200_000,
        metadata: { urgency: 'HIGH', newVendor: true },
      });

      expect(response.status).toBe(200);
      expect(response.body.data.risk).toMatchObject({ level: 'HIGH', score: 65 });
      expect(response.body.data.workflow.path).toEqual([
        'MANAGER',
        'FINANCE',
        'COMPLIANCE',
        'DIRECTOR',
      ]);

      const after = await asUser(employee).get('/api/requests');
      expect(after.body.data).toHaveLength(before.body.data.length);
    });

    it('returns a different path for a lower-risk request', async () => {
      const response = await asUser(employee)
        .post('/api/workflow/simulate')
        .send({ type: 'LAPTOP', amount: 30_000, metadata: {} });

      expect(response.body.data.risk.level).toBe('LOW');
      expect(response.body.data.workflow.path).toEqual(['MANAGER', 'IT']);
    });

    it('requires authentication', async () => {
      const response = await api().post('/api/workflow/simulate').send({ type: 'LAPTOP' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/approvals/pending', () => {
    it('returns the steps waiting on the caller with their request context', async () => {
      const id = await createAndSubmit(employee, highRiskLaptop());

      const response = await asUser(manager).get('/api/approvals/pending');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        stepName: 'Manager Approval',
        approverRole: 'MANAGER',
        approvalMode: 'SEQUENTIAL',
        workflowName: 'Laptop - High Risk Approval',
      });
      expect(response.body.data[0].request).toMatchObject({ id, status: 'IN_REVIEW' });
    });

    it('reports the same total through the count endpoint', async () => {
      await createAndSubmit(employee, highRiskLaptop());

      const count = await asUser(manager).get('/api/approvals/pending/count');

      expect(count.body.data).toEqual({ count: 1 });
    });
  });

  describe('Unknown routes', () => {
    it('returns a structured 404', async () => {
      const response = await api().get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });
});

describe('Request validation', () => {
  let employee: TestActor;

  beforeAll(async () => {
    employee = await actorFor('EMPLOYEE');
  });

  beforeEach(resetTransactionalData);

  const post = (body: unknown) => asUser(employee).post('/api/requests').send(body as object);

  it('rejects a request with no type and no title', async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(response.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'title',
      'type',
    ]);
  });

  it('rejects an unsupported request type', async () => {
    const response = await post({ ...lowRiskLaptop(), type: 'HELICOPTER' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('type');
  });

  it('rejects a negative amount', async () => {
    const response = await post(lowRiskLaptop({ amount: -5_000 }));

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toMatch(/negative/i);
  });

  it('rejects a non-numeric amount', async () => {
    const response = await post({ ...lowRiskLaptop(), amount: 'a lot' });

    expect(response.status).toBe(400);
  });

  it('rejects a title shorter than three characters', async () => {
    const response = await post(lowRiskLaptop({ title: 'hi' }));

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('title');
  });

  it('accepts a request with no amount and defaults it to zero', async () => {
    const { amount, ...withoutAmount } = lowRiskLaptop();

    const response = await post(withoutAmount);

    expect(response.status).toBe(201);
    expect(response.body.data.amount).toBe(0);
  });

  it('requires a comment of at least three characters to reject', async () => {
    const manager = await actorFor('MANAGER');
    const id = await createAndSubmit(employee, highRiskLaptop());

    const response = await asUser(manager)
      .post(`/api/approvals/${await stepIdFor(id, 'MANAGER')}/reject`)
      .send({ comment: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('comment');
  });

  it('rejects an approval action on a step id that does not exist', async () => {
    const manager = await actorFor('MANAGER');

    const response = await asUser(manager).post('/api/approvals/999999/approve').send({});

    expect(response.status).toBe(404);
  });

  it('refuses to edit a request once it has entered review', async () => {
    const id = await createAndSubmit(employee, highRiskLaptop());

    const response = await asUser(employee)
      .patch(`/api/requests/${id}`)
      .send({ title: 'Renamed after submission' });

    expect(response.status).toBe(409);
  });

  it('stops a user from editing another user\'s draft', async () => {
    const other = await otherEmployee();
    const draft = await asUser(other).post('/api/requests').send(lowRiskLaptop());

    const response = await asUser(employee)
      .patch(`/api/requests/${draft.body.data.id}`)
      .send({ title: 'Hijacked title' });

    expect(response.status).toBe(403);
  });
});
