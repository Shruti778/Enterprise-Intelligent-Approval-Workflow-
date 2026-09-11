import { Request } from '../../src/models';
import * as approvalService from '../../src/services/approval/approvalService';
import { resetTransactionalData } from '../helpers/db';
import { highRiskTravel } from '../helpers/fixtures';
import { actorFor, TestActor } from '../helpers/users';
import { createAndSubmit, liveInstance, stepIdFor, stepStatuses, stepsOf } from '../helpers/workflow';
import { detail } from '../helpers/views';

/**
 * "Travel - High Risk Approval" is the platform's parallel blueprint:
 * Manager -> (Finance + Compliance, both at step order 2) -> Director.
 */
describe('Parallel approval stage (Manager -> Finance + Compliance -> Director)', () => {
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
    requestId = await createAndSubmit(employee, highRiskTravel());
  });

  it('builds a workflow where Finance and Compliance share one stage', async () => {
    const steps = await stepsOf(requestId);

    expect(steps.map((step) => [step.approverRole, step.stepOrder])).toEqual([
      ['MANAGER', 1],
      ['FINANCE', 2],
      ['COMPLIANCE', 2],
      ['DIRECTOR', 3],
    ]);
    expect(steps.filter((step) => step.stepOrder === 2).every((s) => s.approvalMode === 'PARALLEL')).toBe(true);
  });

  it('opens Finance and Compliance together once the Manager approves', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'PENDING',
      COMPLIANCE: 'PENDING',
      DIRECTOR: 'WAITING',
    });
  });

  it('keeps the Director waiting while one half of the parallel stage is outstanding', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'), 'Budget confirmed.');

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'PENDING',
      DIRECTOR: 'WAITING',
    });
    expect((await liveInstance(requestId)).currentStep).toBe(2);
  });

  it('opens the Director step only after both parallel approvers have signed off', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));
    await approveAs(compliance, await stepIdFor(requestId, 'COMPLIANCE'), 'Sanctions check clear.');

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'APPROVED',
      DIRECTOR: 'PENDING',
    });
    expect((await liveInstance(requestId)).currentStep).toBe(3);
  });

  it('reaches the same outcome when the parallel approvers act in the opposite order', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(compliance, await stepIdFor(requestId, 'COMPLIANCE'));

    expect((await stepStatuses(requestId)).DIRECTOR).toBe('WAITING');

    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));

    expect((await stepStatuses(requestId)).DIRECTOR).toBe('PENDING');
  });

  it('approves the request once the Director signs off after the parallel stage', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'));
    await approveAs(compliance, await stepIdFor(requestId, 'COMPLIANCE'));
    const view = await approveAs(director, await stepIdFor(requestId, 'DIRECTOR'));

    expect(detail(view).status).toBe('APPROVED');
    expect((await liveInstance(requestId)).status).toBe('APPROVED');
  });

  it('ends the workflow when one branch of the parallel stage rejects', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));
    await approveAs(finance, await stepIdFor(requestId, 'FINANCE'), 'Budget confirmed.');

    await approvalService.rejectStep(
      await stepIdFor(requestId, 'COMPLIANCE'),
      { id: compliance.id, role: compliance.role },
      'Destination is on the restricted list.'
    );

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'APPROVED',
      COMPLIANCE: 'REJECTED',
      DIRECTOR: 'SKIPPED',
    });

    const request = await Request.findByPk(requestId);
    expect(request!.status).toBe('REJECTED');
    expect((await liveInstance(requestId)).status).toBe('REJECTED');
  });

  it('closes the still-pending sibling branch when the other one rejects first', async () => {
    await approveAs(manager, await stepIdFor(requestId, 'MANAGER'));

    await approvalService.rejectStep(
      await stepIdFor(requestId, 'FINANCE'),
      { id: finance.id, role: finance.role },
      'Trip cost exceeds the quarterly travel budget.'
    );

    expect(await stepStatuses(requestId)).toEqual({
      MANAGER: 'APPROVED',
      FINANCE: 'REJECTED',
      COMPLIANCE: 'SKIPPED',
      DIRECTOR: 'SKIPPED',
    });
  });
});
