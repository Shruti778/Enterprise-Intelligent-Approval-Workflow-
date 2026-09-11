import { Router } from 'express';
import * as requestController from '../controllers/requestController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  createRequestSchema,
  updateRequestSchema,
  listRequestsSchema,
  idParamSchema,
} from '../validators/schemas';

const router = Router();

router.use(authenticate);

router.get('/', validate(listRequestsSchema, 'query'), requestController.listRequests);
router.get('/stats', requestController.requestStats);
router.post('/', validate(createRequestSchema), requestController.createRequest);
router.get('/:id', validate(idParamSchema, 'params'), requestController.getRequest);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRequestSchema),
  requestController.updateRequest
);
router.post('/:id/submit', validate(idParamSchema, 'params'), requestController.submitRequest);
router.post('/:id/resubmit', validate(idParamSchema, 'params'), requestController.resubmitRequest);
router.get('/:id/audit', validate(idParamSchema, 'params'), requestController.requestAuditTrail);

export default router;
