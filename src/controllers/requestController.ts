import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/response';
import * as requestService from '../services/requestService';
import * as auditService from '../services/auditService';

const actorOf = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.listRequests(actorOf(req), req.query as never);
  return sendSuccess(res, data);
});

export const createRequest = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.createRequest(req.user!.id, req.body);
  return sendCreated(res, data, 'Request created as DRAFT');
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.getRequestById(Number(req.params.id), actorOf(req));
  return sendSuccess(res, data);
});

export const updateRequest = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.updateDraft(Number(req.params.id), actorOf(req), req.body);
  return sendSuccess(res, data, 200, 'Request updated');
});

export const submitRequest = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.submitRequest(Number(req.params.id), actorOf(req));
  return sendSuccess(res, data, 200, 'Request submitted for approval');
});

export const resubmitRequest = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.submitRequest(Number(req.params.id), actorOf(req), {
    resubmit: true,
  });
  return sendSuccess(res, data, 200, 'Request resubmitted for approval');
});

export const requestStats = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestService.statsFor(actorOf(req));
  return sendSuccess(res, data);
});

export const requestAuditTrail = asyncHandler(async (req: Request, res: Response) => {
  // Access check first so the audit trail cannot be used to probe other requests.
  await requestService.getRequestById(Number(req.params.id), actorOf(req));
  const logs = await auditService.listRequestTrail(Number(req.params.id));
  return sendSuccess(res, logs);
});
