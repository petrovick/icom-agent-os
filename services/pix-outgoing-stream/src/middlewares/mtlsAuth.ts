import { Request, Response, NextFunction } from 'express';
import { TLSSocket } from 'node:tls';
import { config } from '../config';

const hasValidCertificate = (req: Request) => {
  const socket = req.socket as TLSSocket;
  if (socket && typeof socket.getPeerCertificate === 'function') {
    const cert = socket.getPeerCertificate(false);
    return socket.authorized && cert && Object.keys(cert).length > 0;
  }
  return false;
};

const hasSimulationHeader = (req: Request) => {
  if (!config.security.allowHeaderSimulation()) return false;
  const subject = req.header('x-mtls-subject');
  if (subject) {
    req.mtls = { subject };
    return true;
  }
  return false;
};

export const mtlsAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!config.security.mtlsRequired()) {
    if (hasSimulationHeader(req)) {
      return next();
    }
    return next();
  }

  if (hasValidCertificate(req) || hasSimulationHeader(req)) {
    return next();
  }

  return res.status(401).json({
    code: 'UNAUTHORIZED',
    message: 'Client certificate required',
  });
};
