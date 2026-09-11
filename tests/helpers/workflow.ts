import { WorkflowInstance, WorkflowInstanceStep } from '../../src/models';
import * as requestService from '../../src/services/requestService';
import type { RoleName, StepStatus } from '../../src/types/domain';
import type { RequestFixture } from './fixtures';
import type { TestActor } from './users';

/** Creates a DRAFT request through the real service and returns its id. */
export async function createRequest(actor: TestActor, fixture: RequestFixture): Promise<number> {
  const created = await requestService.createRequest(actor.id, fixture);
  return created.id;
}

/** Creates and submits a request, so risk + workflow instance exist. */
export async function createAndSubmit(
  actor: TestActor,
  fixture: RequestFixture
): Promise<number> {
  const id = await createRequest(actor, fixture);
  await requestService.submitRequest(id, { id: actor.id, role: actor.role });
  return id;
}

export async function liveInstance(requestId: number): Promise<WorkflowInstance> {
  const instance = await WorkflowInstance.findOne({
    where: { requestId },
    order: [['id', 'DESC']],
  });
  if (!instance) throw new Error(`Request ${requestId} has no workflow instance`);
  return instance;
}

export async function stepsOf(requestId: number): Promise<WorkflowInstanceStep[]> {
  const instance = await liveInstance(requestId);
  return WorkflowInstanceStep.findAll({
    where: { workflowInstanceId: instance.id },
    order: [
      ['stepOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

/** Snapshot of the workflow as `{ MANAGER: 'PENDING', FINANCE: 'WAITING', ... }`. */
export async function stepStatuses(requestId: number): Promise<Record<string, StepStatus>> {
  const steps = await stepsOf(requestId);
  return Object.fromEntries(steps.map((step) => [step.approverRole, step.status]));
}

/** The id of the step currently addressed to `role`. */
export async function stepIdFor(requestId: number, role: RoleName): Promise<number> {
  const steps = await stepsOf(requestId);
  const step = steps.find((candidate) => candidate.approverRole === role);
  if (!step) throw new Error(`Request ${requestId} has no ${role} step`);
  return step.id;
}
