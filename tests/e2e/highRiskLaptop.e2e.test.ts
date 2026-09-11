import { api, asUser } from '../helpers/api';
import { resetTransactionalData } from '../helpers/db';
import { actorFor, SEED_PASSWORD, TestActor } from '../helpers/users';

/**
 * One realistic journey end to end, driven only through the HTTP API:
 * an employee raises a ₹2,00,000 high-specification laptop request from a new
 * vendor, marked urgent. The risk engine scores it HIGH (30 + 25 + 10 = 65) and
 * the workflow engine routes it Manager -> Finance -> Compliance -> Director.
 */
describe('End to end: high-risk laptop request approved by the full chain', () => {
  let employee: TestActor;
  let manager: TestActor;
  let finance: TestActor;
  let compliance: TestActor;
  let director: TestActor;

  beforeAll(async () => {
    [employee, manager, finance, compliance, director] = await Promise.all([
      actorFor('EMPLOYEE'),
      actorFor('MANAGER'),
      actorFor('FINANCE'),
      actorFor('COMPLIANCE'),
      actorFor('DIRECTOR'),
    ]);
    await resetTransactionalData();
  });

  /** The step currently waiting on `role`, taken from that approver's own queue. */
  async function pendingStepFor(actor: TestActor, requestId: number): Promise<number> {
    const queue = await asUser(actor).get('/api/approvals/pending');
    expect(queue.status).toBe(200);

    const item = queue.body.data.find(
      (entry: { request: { id: number } }) => entry.request.id === requestId
    );
    expect(item).toBeDefined();
    return item.stepId;
  }

  const statusesOf = (workflow: { steps: Array<{ approverRole: string; status: string }> }) =>
    Object.fromEntries(workflow.steps.map((step) => [step.approverRole, step.status]));

  it('carries the request from login through to APPROVED with a full audit trail', async () => {
    /* 1. The employee signs in. */
    const login = await api()
      .post('/api/auth/login')
      .send({ email: employee.email, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const employeeToken = login.body.data.token;

    /* 2. They raise the request. */
    const created = await api()
      .post('/api/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'LAPTOP',
        title: 'MacBook Pro M3 Max for ML workloads',
        description: 'High specification machine from a vendor we have not used before.',
        amount: 200_000,
        metadata: {
          specification: 'MacBook Pro 16" M3 Max, 64GB RAM, 2TB SSD',
          purpose: 'Machine learning research',
          urgency: 'HIGH',
          newVendor: true,
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    const requestId: number = created.body.data.id;

    /* 3 & 4. Submitting scores the risk and materialises the workflow. */
    const submitted = await api()
      .post(`/api/requests/${requestId}/submit`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('IN_REVIEW');
    expect(submitted.body.data.risk).toMatchObject({ level: 'HIGH', score: 65 });
    expect(submitted.body.data.risk.factors.map((f: { factor: string }) => f.factor).sort()).toEqual([
      'HIGH_AMOUNT',
      'NEW_VENDOR',
      'URGENT',
    ]);
    expect(submitted.body.data.workflow.definition.name).toBe('Laptop - High Risk Approval');
    expect(statusesOf(submitted.body.data.workflow)).toEqual({
      MANAGER: 'PENDING',
      FINANCE: 'WAITING',
      COMPLIANCE: 'WAITING',
      DIRECTOR: 'WAITING',
    });

    /* 5 & 6. The Manager sees it in their queue and approves. */
    const managerStep = await pendingStepFor(manager, requestId);
    const afterManager = await asUser(manager)
      .post(`/api/approvals/${managerStep}/approve`)
      .send({ comment: 'Justified for the ML roadmap.' });
    expect(afterManager.status).toBe(200);

    /* 7. Finance becomes the pending stage. */
    expect(statusesOf(afterManager.body.data.workflow)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'PENDING',
      COMPLIANCE: 'WAITING',
      DIRECTOR: 'WAITING',
    });

    /* 8 & 9. Finance approves, Compliance becomes pending. */
    const financeStep = await pendingStepFor(finance, requestId);
    const afterFinance = await asUser(finance)
      .post(`/api/approvals/${financeStep}/approve`)
      .send({ comment: 'Within the capex allocation.' });
    expect(statusesOf(afterFinance.body.data.workflow)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'PENDING',
      DIRECTOR: 'WAITING',
    });

    /* 10 & 11. Compliance approves, the Director becomes pending. */
    const complianceStep = await pendingStepFor(compliance, requestId);
    const afterCompliance = await asUser(compliance)
      .post(`/api/approvals/${complianceStep}/approve`)
      .send({ comment: 'New vendor cleared due diligence.' });
    expect(statusesOf(afterCompliance.body.data.workflow)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'APPROVED',
      DIRECTOR: 'PENDING',
    });

    /* 12 & 13. The Director signs off and the request is APPROVED. */
    const directorStep = await pendingStepFor(director, requestId);
    const afterDirector = await asUser(director)
      .post(`/api/approvals/${directorStep}/approve`)
      .send({ comment: 'Approved.' });
    expect(afterDirector.status).toBe(200);
    expect(afterDirector.body.data.status).toBe('APPROVED');
    expect(afterDirector.body.data.workflow.status).toBe('APPROVED');
    expect(afterDirector.body.data.currentStage).toBe('Completed');

    /* 14. Every decision and its comment survives on the request. */
    const final = await api()
      .get(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(final.status).toBe(200);

    const comments = final.body.data.workflow.steps.map(
      (step: { approverRole: string; actions: Array<{ action: string; comment: string }> }) => [
        step.approverRole,
        step.actions[0]?.action,
        step.actions[0]?.comment,
      ]
    );
    expect(comments).toEqual([
      ['MANAGER', 'APPROVED', 'Justified for the ML roadmap.'],
      ['FINANCE', 'APPROVED', 'Within the capex allocation.'],
      ['COMPLIANCE', 'APPROVED', 'New vendor cleared due diligence.'],
      ['DIRECTOR', 'APPROVED', 'Approved.'],
    ]);

    const audit = await api()
      .get(`/api/requests/${requestId}/audit`)
      .set('Authorization', `Bearer ${employeeToken}`);
    const auditActions = audit.body.data.map((entry: { action: string }) => entry.action);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        'REQUEST_CREATED',
        'RISK_CALCULATED',
        'WORKFLOW_CREATED',
        'REQUEST_SUBMITTED',
        'APPROVAL_APPROVED',
        'REQUEST_APPROVED',
      ])
    );
    expect(auditActions.filter((action: string) => action === 'APPROVAL_APPROVED')).toHaveLength(4);

    /* Nothing is left waiting on anyone. */
    for (const approver of [manager, finance, compliance, director]) {
      const queue = await asUser(approver).get('/api/approvals/pending');
      expect(
        queue.body.data.filter((entry: { request: { id: number } }) => entry.request.id === requestId)
      ).toHaveLength(0);
    }
  });
});
