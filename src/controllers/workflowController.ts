import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import * as requestService from '../services/requestService';
import { WorkflowDefinition, WorkflowRule, WorkflowStepDefinition } from '../models';

export const simulate = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.simulate(req.body);
  return sendSuccess(res, data);
});

export const listDefinitions = asyncHandler(async (_req: Request, res: Response) => {
  const definitions = await WorkflowDefinition.findAll({
    include: [
      { model: WorkflowRule, as: 'rules' },
      { model: WorkflowStepDefinition, as: 'stepDefinitions' },
    ],
    order: [
      ['id', 'ASC'],
      [{ model: WorkflowStepDefinition, as: 'stepDefinitions' }, 'step_order', 'ASC'],
    ],
  });
  return sendSuccess(res, definitions);
});
