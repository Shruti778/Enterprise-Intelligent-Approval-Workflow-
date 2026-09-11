import {
  ApprovalAction,
  AuditLog,
  Request,
  RiskAssessment,
  RiskFactor,
  WorkflowInstance,
  WorkflowInstanceStep,
} from '../../src/models';
import * as approvalService from '../../src/services/approval/approvalService';
import * as requestService from '../../src/services/requestService';
import { RISK_ENGINE_VERSION } from '../../src/services/risk/riskEngine';
import { AUDIT_ACTIONS } from '../../src/types/domain';
import { resetTransactionalData } from '../helpers/db';
import { highRiskLaptop } from '../helpers/fixtures';
import { actorFor, TestActor } from '../helpers/users';
import { createAndSubmit, createRequest, liveInstance, stepIdFor } from '../helpers/workflow';

describe('Persistence of the submit pipeline', () => {
  let employee: TestActor;
  let requestId: number;

  beforeAll(async () => {
    employee = await actorFor('EMPLOYEE');
  });

  beforeEach(async () => {
    await resetTransactionalData();
    requestId = await createAndSubmit(employee, highRiskLaptop());
  });

  it('stores the request with its metadata, amount and requester', async () => {
    const request = await Request.findByPk(requestId);

    expect(request).not.toBeNull();
    expect(request!.requestedBy).toBe(employee.id);
    expect(request!.status).toBe('IN_REVIEW');
    expect(Number(request!.amount)).toBe(200_000);
    expect(request!.metadata).toMatchObject({ newVendor: true, urgency: 'HIGH' });
    expect(request!.requestNumber).toMatch(/^REQ-\d+$/);
  });

  it('stores the risk assessment produced at submission', async () => {
    const assessment = await RiskAssessment.findOne({ where: { requestId } });

    expect(assessment).not.toBeNull();
    expect(assessment!.level).toBe('HIGH');
    expect(assessment!.score).toBe(65);
    expect(assessment!.engineVersion).toBe(RISK_ENGINE_VERSION);
    expect(assessment!.evaluatedAt).toBeInstanceOf(Date);
  });

  it('stores one row per contributing risk factor, summing to the score', async () => {
    const assessment = await RiskAssessment.findOne({ where: { requestId } });
    const factors = await RiskFactor.findAll({ where: { riskAssessmentId: assessment!.id } });

    expect(factors.map((factor) => factor.factor).sort()).toEqual([
      'HIGH_AMOUNT',
      'NEW_VENDOR',
      'URGENT',
    ]);
    expect(factors.reduce((total, factor) => total + factor.score, 0)).toBe(assessment!.score);
    factors.forEach((factor) => expect(factor.description).toBeTruthy());
  });

  it('stores the workflow instance linked to its definition', async () => {
    const instance = await liveInstance(requestId);

    expect(instance.status).toBe('IN_PROGRESS');
    expect(instance.currentStep).toBe(1);
    expect(instance.startedAt).toBeInstanceOf(Date);
    expect(instance.completedAt).toBeNull();
    expect(instance.workflowDefinitionId).toEqual(expect.any(Number));
  });

  it('copies each step of the blueprint into the instance', async () => {
    const instance = await liveInstance(requestId);
    const steps = await WorkflowInstanceStep.findAll({
      where: { workflowInstanceId: instance.id },
      order: [['stepOrder', 'ASC']],
    });

    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.approverRole)).toEqual([
      'MANAGER',
      'FINANCE',
      'COMPLIANCE',
      'DIRECTOR',
    ]);
    // The copy is what keeps a running workflow immune to later blueprint edits.
    steps.forEach((step) => {
      expect(step.stepDefinitionId).toEqual(expect.any(Number));
      expect(step.required).toBe(true);
    });
    expect(steps[0].status).toBe('PENDING');
    expect(steps.slice(1).map((step) => step.status)).toEqual(['WAITING', 'WAITING', 'WAITING']);
  });

  it('stores an approval action row for every decision taken', async () => {
    const manager = await actorFor('MANAGER');
    const stepId = await stepIdFor(requestId, 'MANAGER');

    await approvalService.approveStep(stepId, { id: manager.id, role: manager.role }, 'Approved.');

    const action = await ApprovalAction.findOne({ where: { workflowStepId: stepId } });
    expect(action).toMatchObject({
      action: 'APPROVED',
      actorId: manager.id,
      comment: 'Approved.',
    });
  });

  it('writes the audit trail for creation, risk, workflow and submission', async () => {
    const logs = await AuditLog.findAll({ order: [['id', 'ASC']] });
    const actions = logs.map((log) => log.action);

    expect(actions).toEqual([
      AUDIT_ACTIONS.REQUEST_CREATED,
      AUDIT_ACTIONS.RISK_CALCULATED,
      AUDIT_ACTIONS.WORKFLOW_CREATED,
      AUDIT_ACTIONS.REQUEST_SUBMITTED,
    ]);

    const risk = logs.find((log) => log.action === AUDIT_ACTIONS.RISK_CALCULATED)!;
    expect(risk.metadata).toMatchObject({ level: 'HIGH', score: 65 });
    expect(logs.every((log) => log.userId === employee.id)).toBe(true);
  });

  it('does not create a risk assessment or workflow for a request left as a draft', async () => {
    await resetTransactionalData();
    const draftId = await createRequest(employee, highRiskLaptop());

    expect(await RiskAssessment.count({ where: { requestId: draftId } })).toBe(0);
    expect(await WorkflowInstance.count({ where: { requestId: draftId } })).toBe(0);
    expect((await Request.findByPk(draftId))!.status).toBe('DRAFT');
  });

  it('keeps the rejected workflow instance and starts a new one on resubmission', async () => {
    const manager = await actorFor('MANAGER');
    const firstInstanceId = (await liveInstance(requestId)).id;

    await approvalService.rejectStep(
      await stepIdFor(requestId, 'MANAGER'),
      { id: manager.id, role: manager.role },
      'Please revise.'
    );

    await requestService.submitRequest(
      requestId,
      { id: employee.id, role: employee.role },
      { resubmit: true }
    );

    const instances = await WorkflowInstance.findAll({
      where: { requestId },
      order: [['id', 'ASC']],
    });
    expect(instances).toHaveLength(2);
    expect(instances[0].id).toBe(firstInstanceId);
    expect(instances[0].status).toBe('REJECTED');
    expect(instances[1].status).toBe('IN_PROGRESS');
    // The old assessment is kept, so the history of scoring is not overwritten.
    expect(await RiskAssessment.count({ where: { requestId } })).toBe(2);
  });
});
