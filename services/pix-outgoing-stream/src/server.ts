import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { config } from './config';
import { createApp } from './app';
import { logger } from './logger';

const app = createApp();

const startServer = () => {
  const { keyPath, certPath, caCertPath } = config.security;
  if (keyPath && certPath) {
    const options: https.ServerOptions = {
      key: fs.readFileSync(keyPath, 'utf-8'),
      cert: fs.readFileSync(certPath, 'utf-8'),
      ca: caCertPath ? fs.readFileSync(caCertPath, 'utf-8') : undefined,
      requestCert: true,
      rejectUnauthorized: false,
    };

    https.createServer(options, app).listen(config.port, config.host, () => {
      logger.info('HTTPS server listening', { port: config.port, host: config.host });
    });
    return;
  }

  http.createServer(app).listen(config.port, config.host, () => {
    logger.info('HTTP server listening', { port: config.port, host: config.host });
  });
};

startServer();
