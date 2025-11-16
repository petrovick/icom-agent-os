import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const existingId = req.header('x-request-id') ?? randomUUID();
  req.requestId = existingId;
  res.setHeader('x-request-id', existingId);
  next();
};
