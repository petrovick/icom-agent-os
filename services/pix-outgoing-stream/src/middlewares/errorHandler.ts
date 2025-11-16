import { Request, Response, NextFunction } from 'express';

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // In a future iteration, send this to structured logging/observability stack.
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
};
