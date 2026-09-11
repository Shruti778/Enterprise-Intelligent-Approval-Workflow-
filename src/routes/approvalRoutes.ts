import { Router } from 'express';
import * as approvalController from '../controllers/approvalController';
import { authenticate } from '../middleware/authenticate';
import { authorize, APPROVER_ROLES } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { approveSchema, rejectSchema, stepIdParamSchema } from '../validators/schemas';

const router = Router();

router.use(authenticate);
// Coarse gate; the service still checks the step's own role before acting.
router.use(authorize(...APPROVER_ROLES, 'ADMIN'));

router.get('/pending', approvalController.listPending);
router.get('/pending/count', approvalController.pendingCount);

router.post(
  '/:stepId/approve',
  validate(stepIdParamSchema, 'params'),
  validate(approveSchema),
  approvalController.approve
);

router.post(
  '/:stepId/reject',
  validate(stepIdParamSchema, 'params'),
  validate(rejectSchema),
  approvalController.reject
);

export default router;
