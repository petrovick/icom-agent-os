# Specification: Pix Outgoing Stream Pull API

## Goal
Deliver an SPI-faithful outgoing Pix pull service that lets each participant PSP stream outbound Pix messages through two GET endpoints with guaranteed ordering, XML batching, and operational guardrails. The service must sustain millions of polls per minute while remaining observable, compliant, and resilient.

## User Stories
- As a participant PSP integration lead, I want a `/stream/start` endpoint that returns a cursor and initial batch so that my downstream core banking stack can consume Pix messages without gaps.
- As a PSP operations engineer, I want `/stream/{piPullNext}` to support six concurrent polling threads with clear throttling signals so that I can scale consumption safely during spikes.
- As a compliance analyst, I want per-ISPB metrics, logs, and audit trails so that I can prove delivery history and investigate anomalies without impacting production streams.

## Specific Requirements

**API contracts & flows**
- Implement `GET /api/v1/out/{ispb}/stream/start` and `GET /api/v1/out/{ispb}/stream/{piPullNext}` following REST and versioning standards.
- `/stream/start` authenticates the PSP, loads the first unread cursor for `{ispb}`, and returns up to 10 XML-formatted messages plus the `pi-pull-next` header.
- `/stream/{piPullNext}` validates the supplied cursor, retrieves the next ordered slice (up to 10 messages), and emits a refreshed `pi-pull-next`.
- Return HTTP 200 with XML body for success, `204 No Content` when no messages remain (still include most recent cursor), `400/401/404` for invalid cursors/tenants, and `429` when concurrency caps are exceeded.
- Include rate-limit headers (`X-RateLimit-Remaining`, etc.) aligned with backend/api.md guidance.
- Enforce idempotent consumption: repeated calls with the same cursor return the same message batch until a newer cursor is issued.

**Cursor & token model**
- Represent `pi-pull-next` as an opaque, signed token encoding tenant ID, partition shard, cursor offset, and expiry timestamp to prevent tampering.
- Store canonical cursor positions per `{ispb}` and thread slot inside Cassandra partitions keyed by tenant and stream topic.
- Cache hot cursor metadata in Redis for sub-millisecond validation and to throttle stale tokens.
- Expire unused cursors after configurable inactivity; clients must re-initiate via `/stream/start` after expiry.
- Support detection of out-of-order tokens by embedding monotonic sequence numbers and rejecting tokens older than the persisted cursor.
- Log every token issuance and redemption for audit linkage between HTTP requests and message batches.

**Message storage & sourcing**
- Persist outbound Pix messages (already validated and authorized upstream) into Cassandra with ordering keys (e.g., event time + monotonic ID) per ISPB.
- Maintain a lightweight Redis Stream buffer for fresh events so hot consumers can read before full persistence completes.
- Stamp each message with delivery status (undelivered, delivered, replay) and update atomically when a cursor advances to ensure once-only semantics.
- Provide retention policies configurable per ISPB to support replay windows mandated by compliance.
- Partition/shard data by ISPB and optional region to parallelize reads and avoid hotspotting under millions of RPM.
- Include back-pressure flags to upstream producers when undelivered queues rise beyond thresholds.

**XML batching & boundary formatting**
- Generate XML bodies containing up to 10 `<PixMessage>` fragments separated by deterministic boundary strings (similar to multipart/mixed).
- Align message schema with Banco Central Pix definitions; validate each batch against XSD prior to sending to prevent malformed data.
- Include boundary metadata (e.g., `Content-Type: multipart/mixed; boundary=PIX-STREAM`) and replicate inside body for downstream parsing.
- Provide per-message metadata (sequence number, timestamp, message type) inside the XML segment header so consumers can reconcile.
- On schema validation failure, mark the offending message, skip emission, raise alerts, and continue with remaining valid messages when safe.
- Offer optional compression (gzip) negotiated via `Accept-Encoding` while keeping XML as canonical payload.

**Concurrency & rate controls**
- Track up to six active polling threads per `{ispb}`, allocating thread slots keyed by auth credential + client identifier.
- Use distributed locking (Redis or Cassandra lightweight transactions) to ensure two concurrent requests do not advance the same cursor simultaneously.
- If a seventh thread attempts to poll, return `429` with headers describing wait/back-off expectations plus telemetry to observability stack.
- Allow PSPs to see thread-slot usage via response headers (e.g., `pi-thread-slot: 2/6`) to tune their client pools.
- Implement sliding-window rate limiting per PSP (requests per second/minute) to protect infrastructure during spikes.
- Provide adaptive back-pressure responses when storage partitions indicate lag, instructing clients to slow their polling cadence.

**Scalability & performance**
- Deploy API stateless nodes (Express on Node.js) behind a load balancer with horizontal auto-scaling policies based on CPU, latency, and request volume.
- Use Cassandra partitioning plus read replicas to sustain millions of sequential reads with predictable latency; monitor p99 under 200ms per batch.
- Keep Redis cursor caches in clustered mode with sharding per ISPB for high availability; configure persistence for crash recovery.
- Batch logging/metrics asynchronously to avoid blocking critical path.
- Run chaos and load tests simulating millions of RPM and failover between regions to validate throughput targets.
- Support multi-region active-active deployments with deterministic partition ownership to maintain contiguous ordering per ISPB.

**Reliability & failure handling**
- Treat each endpoint call as a transaction: only advance the persisted cursor after the batch response is successfully serialized.
- Implement retries with exponential backoff for transient Cassandra/Redis errors; surface `503` with retry-after headers when backend failures persist.
- On Node process failure mid-stream, rely on persisted cursor state to avoid data loss; clients can safely retry with previous token.
- Provide admin tooling to reset a cursor to a safe checkpoint for recovery scenarios, with full audit logs.
- Ensure zero-downtime deployments by draining in-flight requests and keeping migrations backward-compatible per backend/migrations.md.
- Validate inputs early (ISPB format, cursor signatures) to fail fast and reduce expensive downstream processing.

**Security & compliance**
- Require mutual TLS or signed tokens that bind to ISPB and thread identity; reject calls when credential scope does not match `{ispb}`.
- Encrypt all data in transit and at rest (TLS, encrypted Cassandra/Redis volumes) per organizational policy.
- Implement per-request authorization checks verifying the caller’s entitlement to the tenant’s stream.
- Produce immutable audit logs capturing requester, cursor, batch IDs, and timestamps; store logs in tamper-evident storage.
- Mask sensitive payload fields in logs while preserving necessary metadata for investigation.
- Provide configurable retention windows and legal-hold capabilities for replay data needed by regulators.

**Observability & operational controls**
- Emit metrics per ISPB: request rate, success/error counts, lag (oldest undelivered timestamp), cursor churn, thread-slot usage.
- Send logs with correlation IDs linking HTTP request IDs, cursor tokens, and Cassandra batch IDs to OpenSearch/OTel.
- Trace each request through API, cache, and storage layers to detect latency outliers quickly.
- Surface alerts for lag thresholds, repeated invalid tokens, concurrency violations, and storage saturation.
- Build operational APIs/console hooks for pausing a tenant stream, throttling limits, or forcing cursor advance after manual review.
- Provide dashboards summarizing SLA health (p50/p95 latency, message age) for platform and PSP teams.

## Visual Design
No visual assets were provided for this specification.

## Existing Code to Leverage

**Standard Express service scaffolding (global tech stack)**
- Reuse the organization’s Express/Node service template to ensure consistency with deployment, linting, and configuration patterns.
- Adopt existing middleware conventions for authentication, rate limiting, and structured logging.
- Integrate with the shared npm tooling (lint, tests) already defined in the global tech stack standard.

**Observability stack integrations**
- Plug into the established OpenTelemetry → OpenSearch pipeline for metrics, logs, and traces without inventing new tooling.
- Follow existing alert routing rules (GitHub Actions + monitoring) so platform teams receive incidents in familiar channels.

## Out of Scope
- Building the upstream Pix message ingestion or validation pipeline; this spec only covers pulling already-approved outgoing messages.
- Providing push/webhook delivery mechanisms; clients must poll using the defined GET endpoints.
- Creating UI dashboards or portals for PSPs; operational consoles are limited to internal tooling/APIs.
- Supporting more than six concurrent polling threads per ISPB; future increases require a new spec.
- Designing detailed database schemas or migration scripts; only conceptual data models and retention policies are defined here.
- Handling inbound Pix flows or two-way settlement confirmations.
- Full replay/export tooling for historical data beyond the retention windows described above.
- Integration with third-party authentication providers outside the organization’s existing identity stack.

The spec has been created at `agent-os/specs/pix-outgoing-stream-pull-api/spec.md`.

Review it closely to ensure everything aligns with your vision and requirements.

Next step: Run the command, 2-create-tasks-list.md
