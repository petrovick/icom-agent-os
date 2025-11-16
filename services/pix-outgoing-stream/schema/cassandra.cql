-- Keyspace
CREATE KEYSPACE IF NOT EXISTS pix_streams
WITH replication = {'class': 'NetworkTopologyStrategy', 'sa-east-1': 3, 'us-east-1': 3}
AND durable_writes = true;

USE pix_streams;

-- Stream table stores batches of XML payloads grouped per ISPB and chronology
CREATE TABLE IF NOT EXISTS pix_streams (
  region text,
  ispb text,
  stream_ts timestamp,
  stream_id uuid,
  messages list<text>,
  status text,
  cursor_seq bigint,
  thread_slot tinyint,
  delivery_state map<uuid, text>,
  primary key ((region, ispb), stream_ts, stream_id)
) WITH CLUSTERING ORDER BY (stream_ts ASC, stream_id ASC);

-- Cursor table tracks canonical cursor per ISPB/thread slot
CREATE TABLE IF NOT EXISTS pix_cursors (
  region text,
  ispb text,
  thread_slot tinyint,
  cursor_seq bigint,
  cursor_offset uuid,
  token_hash text,
  token_expiry timestamp,
  last_heartbeat timestamp,
  pi_pull_next_id text,
  primary key ((region, ispb), thread_slot)
);

-- Policy table (optional) for retention/legal holds
CREATE TABLE IF NOT EXISTS ispb_policies (
  ispb text primary key,
  retention_days int,
  legal_hold boolean,
  updated_at timestamp
);
