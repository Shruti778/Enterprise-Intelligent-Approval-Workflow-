import { ApprovalAction, AuditLog, Request } from '../../src/models';
import * as approvalService from '../../src/services/approval/approvalService';
import * as requestService from '../../src/services/requestService';
import { AUDIT_ACTIONS, RoleName } from '../../src/types/domain';
import { resetTransactionalData } from '../helpers/db';
import { highRiskLaptop } from '../helpers/fixtures';
import { actorFor, TestActor } from '../helpers/users';
import { createAndSubmit, liveInstance, stepIdFor, stepStatuses } from '../helpers/workflow';
import { detail, stepByRole } from '../helpers/views';

describe('Rejection at every approval level', () => {
  let employee: TestActor;
  let requestId: number;

  const approveAs = (actor: TestActor, stepId: number) =>
    approvalService.approveStep(stepId, { id: actor.id, role: actor.role });

  const rejectAs = (actor: TestActor, stepId: number, comment: string) =>
    approvalService.rejectStep(stepId, { id: actor.id, role: actor.role }, comment);

  /** Approves every step before `role` so the request is waiting on that role. */
  async function advanceTo(role: RoleName) {
    const chain: RoleName[] = ['MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR'];
    for (const earlier of chain.slice(0, chain.indexOf(role))) {
      const actor = await actorFor(earlier);
      await approveAs(actor, await stepIdFor(requestId, earlier));
    }
  }

  beforeAll(async () => {
    employee = await actorFor('EMPLOYEE');
  });

  beforeEach(async () => {
    await resetTransactionalData();
    requestId = await createAndSubmit(employee, highRiskLaptop());
  });

  it.each<[RoleName, string]>([
    ['MANAGER', 'Not budgeted for this quarter.'],
    ['FINANCE', 'Quote is well above the approved price band.'],
    ['COMPLIANCE', 'Vendor has not cleared due diligence.'],
    ['DIRECTOR', 'Deferring this purchase to next year.'],
  ])('rejects the whole request when %s rejects', async (role, comment) => {
    await advanceTo(role);
    const actor = await actorFor(role);

    const view = await rejectAs(actor, await stepIdFor(requestId, role), comment);

    expect(detail(view).status).toBe('REJECTED');
    expect(stepByRole(view, role).status).toBe('REJECTED');
    expect((await liveInstance(requestId)).status).toBe('REJECTED');
  });

  it('stops the remaining approval steps rather than continuing past a rejection', async () => {
    await advanceTo('FINANCE');
    const finance = await actorFor('FINANCE');

    await rejectAs(finance, await stepIdFor(requestId, 'FINANCE'), 'Price is not justified.');

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'REJECTED',
      COMPLIANCE: 'SKIPPED',
      DIRECTOR: 'SKIPPED',
    });
    expect((await liveInstance(requestId)).currentStep).toBeNull();
  });

  it('preserves the approval history recorded before the rejection', async () => {
    await advanceTo('COMPLIANCE');
    const compliance = await actorFor('COMPLIANCE');
    const manager = await actorFor('MANAGER');

    const view = await rejectAs(
      compliance,
      await stepIdFor(requestId, 'COMPLIANCE'),
      'Vendor sanctions screening failed.'
    );

    expect(stepByRole(view, 'MANAGER').actions[0]).toMatchObject({ action: 'APPROVED' });
    expect(stepByRole(view, 'FINANCE').actions[0]).toMatchObject({ action: 'APPROVED' });
    expect(stepByRole(view, 'COMPLIANCE').actions[0]).toMatchObject({
      action: 'REJECTED',
      comment: 'Vendor sanctions screening failed.',
    });
    expect(stepByRole(view, 'MANAGER').approver?.id).toBe(manager.id);

    const actions = await ApprovalAction.findAll();
    expect(actions).toHaveLength(3);
  });

  it('will not let a rejected request be approved afterwards', async () => {
    const manager = await actorFor('MANAGER');
    const managerStep = await stepIdFor(requestId, 'MANAGER');
    await rejectAs(manager, managerStep, 'Not approved.');

    await expect(approveAs(manager, managerStep)).rejects.toMatchObject({ statusCode: 409 });

    const finance = await actorFor('FINANCE');
    await expect(
      approveAs(finance, await stepIdFor(requestId, 'FINANCE'))
    ).rejects.toMatchObject({ statusCode: 409 });

    const request = await Request.findByPk(requestId);
    expect(request!.status).toBe('REJECTED');
  });

  it('requires a comment to reject', async () => {
    const manager = await actorFor('MANAGER');
    const stepId = await stepIdFor(requestId, 'MANAGER');

    await expect(rejectAs(manager, stepId, '   ')).rejects.toMatchObject({ statusCode: 400 });
    expect((await stepStatuses(requestId)).MANAGER).toBe('PENDING');
  });

  it('writes an audit entry for the rejection and for the request outcome', async () => {
    const manager = await actorFor('MANAGER');
    await rejectAs(manager, await stepIdFor(requestId, 'MANAGER'), 'Rejected for now.');

    const actions = (await AuditLog.findAll()).map((entry) => entry.action);
    expect(actions).toContain(AUDIT_ACTIONS.APPROVAL_REJECTED);
    expect(actions).toContain(AUDIT_ACTIONS.REQUEST_REJECTED);
  });

  it('lets the requester resubmit a rejected request into a fresh workflow', async () => {
    const manager = await actorFor('MANAGER');
    await rejectAs(manager, await stepIdFor(requestId, 'MANAGER'), 'Resubmit with a second quote.');
    const rejectedInstanceId = (await liveInstance(requestId)).id;

    const view = await requestService.submitRequest(
      requestId,
      { id: employee.id, role: employee.role },
      { resubmit: true }
    );

    expect(detail(view).status).toBe('IN_REVIEW');
    expect(detail(view).workflow!.id).not.toBe(rejectedInstanceId);
    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'PENDING',
      FINANCE: 'WAITING',
      COMPLIANCE: 'WAITING',
      DIRECTOR: 'WAITING',
    });
  });
});
