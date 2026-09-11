import { Router } from 'express';
import authRoutes from './authRoutes';
import requestRoutes from './requestRoutes';
import approvalRoutes from './approvalRoutes';
import workflowRoutes from './workflowRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

router.use('/auth', authRoutes);
router.use('/requests', requestRoutes);
router.use('/approvals', approvalRoutes);
router.use('/workflow', workflowRoutes);

export default router;
