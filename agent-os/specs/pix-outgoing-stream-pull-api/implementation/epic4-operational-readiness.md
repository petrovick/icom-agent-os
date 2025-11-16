# Epic 4 Implementation — Observability, Security & Operations

## 4.1 Monitoring / Alert Scenarios

1. **Lag Spike Alert**
   - Trigger when `cursor_lag_seconds` per ISPB > 60 for 3 consecutive minutes.
   - Response: Pager notification, auto-run backlog diagnostics (queue depth, Redis health).

2. **Invalid Token Storm**
   - Alert when `cursor.invalid` metric > 0.5% of total requests within 5 minutes.
   - Automation: temporarily block offending client_id, capture logs for investigation.

3. **Thread Limit Abuse**
   - Detect >10 `THREAD_LIMIT` responses/min per ISPB. Send advisory to PSP and verify they respect six-thread policy.

4. **XML Schema Failure Burst**
   - If `xml.schema.failure` > 50 events over 10 minutes, quarantine offending producer (feature flag) and alert compliance team.

5. **Redis/Cache Health**
   - Heartbeat monitors for Redis cluster; if node unhealthy >30s, page infra team and switch API to Cassandra-only validation (already documented in architecture).

## 4.2 Metrics / Logs / Traces Catalog

| Signal | Description | Owner | Frequency / Retention |
| --- | --- | --- | --- |
| `request.rate` | Requests/sec per ISPB and endpoint | API team | 30d |
| `cursor_lag_seconds` | Oldest undelivered message age per ISPB | Platform | 30d |
| `thread.slot.usage` | Active thread slots (0-6) | Platform | 30d |
| `cursor.invalid` | Count of invalid/expired pi-pull-next tokens | API | 90d |
| `xml.schema.failure` | Schema validation errors per message type | Compliance | 90d |
| `rate.limit.hit` | Number of rate-limit responses | SRE | 30d |
| `redis.latency` | p95 Redis operations | Infra | 30d |
| `cassandra.read.latency` | p95 read latency per shard | Infra | 90d |
| Logs | Structured JSON via `LoggerHandler` (requestId, ispb, token hash) | Shared | 90d |
| Traces | OTel spans linking HTTP → Redis → Cassandra | SRE | 30d sampled |

## 4.3 Rate Limiting & Backpressure Algorithms

- **Sliding Window:** Redis Lua script increments counters per ISPB. Threshold example: 300 requests/second. Exceeding threshold returns `429` with `Retry-After` computed from how long until window resets.
- **Adaptive Backpressure:** Monitor lag + CPU; when thresholds exceeded, set `X-Backpressure-Signal: slow` header and gradually lower allowed rate. PSP clients instructed to obey signal.
- **Thread Slot Feedback:** Response header `pi-thread-slot: {active}/6` helps clients tune concurrency.
- **Global Kill Switch:** Admin endpoint can cap specific ISPB to fewer than six slots during incidents.

## 4.4 Security & Compliance Checklist

- Mutual TLS enforced at load balancer; tokens scoped to ISPB.
- Requests logged with masked sensitive fields; store audit trail (requester, pi-pull-next hash, batch IDs).
- Data encryption at rest (Cassandra, Redis, SQS) using KMS-managed keys.
- Access control: Service roles limited per least privilege; compliance analysts access replay interfaces via dedicated RBAC roles.
- Retention policies: 30-day default, legal hold override documented; deletion jobs audited.
- Secret rotation: pi-pull-next signing key rotation every 90 days with overlapping validity.
- Pen-test hooks: Provide sanitized pacs samples for security testing.

## 4.5 Operational Runbooks

1. **Tenant Onboarding**
   - Steps: create ISPB entry, configure region mapping, provision credentials, set rate limit defaults, run smoke test hitting `/stream/start`.
2. **Throttling Adjustment**
   - Flow: update Redis-configured thresholds, notify PSP, monitor request rate metric.
3. **Cursor Reset / Replay**
   - Admin CLI to set cursor to prior offset, log reason, inform PSP before action. Verify via dry-run call.
4. **Storage Failure Response**
   - If Cassandra node down: shift traffic to healthy region per DR plan, run repair, notify compliance if replay impacted.
5. **Schema Quarantine**
   - Toggle feature flag to block offending message producer, store sample XML, coordinate fix.

## 4.6 Validation of Monitoring Tests

- Tabletop walkthrough ensures monitoring scenarios trigger before SLA breach:
  - Lag spike alert fires at 60s (before 120s SLA breach).
  - Invalid token storm alert identifies misbehaving PSP quickly.
  - XML schema failure alert ties directly to `samples/` references so teams can inspect payloads.
- Verified each runbook references the components documented in `architecture.md`, keeping ownership clear.
