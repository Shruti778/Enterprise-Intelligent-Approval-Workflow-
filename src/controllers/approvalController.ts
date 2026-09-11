import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import * as approvalService from '../services/approval/approvalService';

const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

export const listPending = asyncHandler(async (req: Request, res: Response) => {
  const data = await approvalService.listPendingApprovals(actorOf(req));
  return sendSuccess(res, data);
});

export const pendingCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await approvalService.pendingCount(actorOf(req));
  return sendSuccess(res, { count });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const data = await approvalService.approveStep(
    Number(req.params.stepId),
    actorOf(req),
    req.body?.comment
  );
  return sendSuccess(res, data, 200, 'Step approved');
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const data = await approvalService.rejectStep(
    Number(req.params.stepId),
    actorOf(req),
    req.body.comment
  );
  return sendSuccess(res, data, 200, 'Request rejected');
});
