import { Router } from 'express';
import { ThreadSlotManager } from '../services/threadSlotManager';

const manager = new ThreadSlotManager();
export const adminRouter = Router();

adminRouter.post('/thread-slots/:ispb/release', async (req, res) => {
  const { ispb } = req.params;
  const { clientId } = req.body;
  await manager.release(ispb, clientId);
  res.json({ status: 'released' });
});
