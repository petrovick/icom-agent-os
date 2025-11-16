import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

export type AppConfig = {
  env: string;
  port: number;
  host: string;
  security: {
    mtlsRequired(): boolean;
    allowHeaderSimulation(): boolean;
    caCertPath?: string;
    keyPath?: string;
    certPath?: string;
    tokenSecret: string;
  };
  telemetry: {
    serviceName: string;
  };
  infra: {
    redisUrl: string;
    cassandraContactPoint: string;
    cassandraKeyspace: string;
    streamTable: string;
    cursorTable: string;
  };
};

const resolveOptionalPath = (maybePath?: string) => {
  if (!maybePath) return undefined;
  const fullPath = path.resolve(maybePath);
  return fs.existsSync(fullPath) ? fullPath : undefined;
};

export const config: AppConfig = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  security: {
    mtlsRequired: () => process.env.MTLS_REQUIRED === 'true',
    allowHeaderSimulation: () => process.env.MTLS_HEADER_SIMULATION !== 'false',
    caCertPath: resolveOptionalPath(process.env.MTLS_CA_PATH),
    keyPath: resolveOptionalPath(process.env.TLS_KEY_PATH),
    certPath: resolveOptionalPath(process.env.TLS_CERT_PATH),
    tokenSecret: process.env.PI_PULL_NEXT_SECRET ?? 'changeme-secret',
  },
  telemetry: {
    serviceName: process.env.SERVICE_NAME ?? 'pix-outgoing-stream',
  },
  infra: {
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    cassandraContactPoint: process.env.CASSANDRA_CONTACT_POINT ?? 'cassandra:9042',
    cassandraKeyspace: process.env.CASSANDRA_KEYSPACE ?? 'pix_streams',
    streamTable: process.env.CASSANDRA_STREAM_TABLE ?? 'pix_streams',
    cursorTable: process.env.CASSANDRA_CURSOR_TABLE ?? 'pix_cursors',
  },
};
