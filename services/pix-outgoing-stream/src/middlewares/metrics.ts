import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

const register = new client.Registry();
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'duration of HTTP requests',
  labelNames: ['route', 'method', 'status'],
});
register.registerMetric(httpRequestDuration);

client.collectDefaultMetrics({ register });

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDuration.startTimer({ route: req.path, method: req.method });
  res.on('finish', () => {
    end({ status: res.statusCode });
  });
  next();
};

export const metricsHandler = (_req: Request, res: Response) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(register.metrics());
};
