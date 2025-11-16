import { Router } from 'express';
import { StreamController } from '../controllers/streamController';

export const buildStreamRouter = () => {
  const router = Router();
  const controller = new StreamController();
  router.get('/:ispb/stream/start', controller.startStream);
  router.get('/:ispb/stream/:piPullNext', controller.nextBatch);
  return router;
};
