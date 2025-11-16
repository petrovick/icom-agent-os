import express from 'express';
import helmet from 'helmet';
import { requestId } from './middlewares/requestId';
import { mtlsAuth } from './middlewares/mtlsAuth';
import { notFound, errorHandler } from './middlewares/errorHandler';
import { healthRouter } from './routes/health';
import { buildStreamRouter } from './routes/stream';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(express.json());
  app.use(requestId);
  app.use(mtlsAuth);

  app.use('/health', healthRouter);
  app.use('/api/v1/out', buildStreamRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
