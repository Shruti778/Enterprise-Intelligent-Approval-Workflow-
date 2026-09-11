import { Request } from '../../src/models';
import * as approvalService from '../../src/services/approval/approvalService';
import { resetTransactionalData } from '../helpers/db';
import { highRiskLaptop } from '../helpers/fixtures';
import { actorFor, TestActor } from '../helpers/users';
import { createAndSubmit, liveInstance, stepIdFor, stepStatuses } from '../helpers/workflow';
import { detail, stepByRole } from '../helpers/views';

describe('Sequential approval lifecycle (Manager -> Finance -> Compliance -> Director)', () => {
  let employee: TestActor;
  let manager: TestActor;
  let finance: TestActor;
  let compliance: TestActor;
  let director: TestActor;
  let requestId: number;

  const approveAs = (actor: TestActor, stepId: number, comment?: string) =>
    approvalService.approveStep(stepId, { id: actor.id, role: actor.role }, comment);

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

  it('opens only the first step and leaves the rest waiting', async () => {
    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'PENDING',
      FINANCE: 'WAITING',
      COMPLIANCE: 'WAITING',
      DIRECTOR: 'WAITING',
    });

    const request = await Request.findByPk(requestId);
    expect(request!.status).toBe('IN_REVIEW');
    expect((await liveInstance(requestId)).currentStep).toBe(1);
  });

  it('hands the request to Finance once the Manager approves', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'), 'Budget is available.');

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'PENDING',
      COMPLIANCE: 'WAITING',
      DIRECTOR: 'WAITING',
    });
    expect((await liveInstance(requestId)).currentStep).toBe(2);
  });

  it('hands the request to Compliance once Finance approves', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'PENDING',
      DIRECTOR: 'WAITING',
    });
  });

  it('hands the request to the Director once Compliance approves', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));
    await approveAs(compliance, await stepIdFor(requestId, 'COMPLIANCE'));

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'APPROVED',
      DIRECTOR: 'PENDING',
    });
  });

  it('approves the request when the Director signs off on the final step', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));
    await approveAs(compliance, await stepIdFor(requestId, 'COMPLIANCE'));
    const view = await approveAs(director, await stepIdFor(requestId, 'DIRECTOR'), 'Approved.');

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'APPROVED',
      DIRECTOR: 'APPROVED',
    });
    expect(detail(view).status).toBe('APPROVED');

    const instance = await liveInstance(requestId);
    expect(instance.status).toBe('APPROVED');
    expect(instance.currentStep).toBeNull();
    expect(instance.completedAt).toBeInstanceOf(Date);
  });

  it('records who approved each step and when', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'), 'Looks reasonable.');
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));

    const view = await approvalService.approveStep(
      await stepIdFor(requestId, 'COMPLIANCE'),
      { id: compliance.id, role: compliance.role },
      'No compliance concerns.'
    );

    const managerStep = stepByRole(view, 'MANAGER');
    expect(managerStep.approver?.id).toBe(manager.id);
    expect(managerStep.completedAt).not.toBeNull();
    expect(managerStep.actions).toHaveLength(1);
    expect(managerStep.actions[0]).toMatchObject({
      action: 'APPROVED',
      comment: 'Looks reasonable.',
    });

    const complianceStep = stepByRole(view, 'COMPLIANCE');
    expect(complianceStep.actions[0].comment).toBe('No compliance concerns.');
  });

  it('refuses to approve a step that is still waiting on an earlier stage', async () => {
    const financeStep = await stepIdFor(requestId, 'FINANCE');

    await expect(approveAs(finance, financeStep)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect((await stepStatuses(requestId)).FINANCE).toBe('WAITING');
  });

  it('refuses to approve the same step twice', async () => {
    const managerStep = await stepIdFor(requestId, 'MANAGER');
    await approveAs(manager, managerStep);

    await expect(approveAs(manager, managerStep)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('does not let a requester approve their own request', async () => {
    // The seeded manager raises a request that lands on a manager step.
    const ownRequestId = await createAndSubmit(manager, highRiskLaptop());
    const stepId = await stepIdFor(ownRequestId, 'MANAGER');

    await expect(approveAs(manager, stepId)).rejects.toMatchObject({ statusCode: 403 });
  });
});
