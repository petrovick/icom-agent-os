import { Client, mapping } from 'cassandra-driver';
import { config } from '../../config';

let client: Client | null = null;

export const getCassandraClient = () => {
  if (client) return client;
  client = new Client({
    contactPoints: [config.infra.cassandraContactPoint],
    localDataCenter: 'datacenter1',
    keyspace: config.infra.cassandraKeyspace,
  });
  return client;
};

export const getMapper = () => {
  const cassandraClient = getCassandraClient();
  return new mapping.Mapper(cassandraClient, {
    models: {
      Stream: {
        tables: [config.infra.streamTable],
        keyspace: config.infra.cassandraKeyspace,
      },
      Cursor: {
        tables: [config.infra.cursorTable],
        keyspace: config.infra.cassandraKeyspace,
      },
    },
  });
};
