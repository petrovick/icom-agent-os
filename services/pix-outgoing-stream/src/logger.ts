import { config } from './config';

export const logger = {
  info: (message: string, meta: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ level: 'info', service: config.telemetry.serviceName, message, ...meta }));
  },
  error: (message: string, meta: Record<string, unknown> = {}) => {
    console.error(JSON.stringify({ level: 'error', service: config.telemetry.serviceName, message, ...meta }));
  },
};
