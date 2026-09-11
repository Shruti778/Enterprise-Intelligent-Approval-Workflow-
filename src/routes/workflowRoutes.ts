import { Router } from 'express';
import * as workflowController from '../controllers/workflowController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { simulateSchema } from '../validators/schemas';

const router = Router();

router.use(authenticate);

router.post('/simulate', validate(simulateSchema), workflowController.simulate);
router.get('/definitions', workflowController.listDefinitions);

export default router;
