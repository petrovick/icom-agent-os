# Task Breakdown: Pix Outgoing Stream Pull API — Implementation Phase

## Overview
Total Tasks: 20

## Task List

### Backend Foundation

#### Epic A: Service & Infrastructure Bootstrap
**Dependencies:** None

- [x] A.0 Stand up the runnable service skeleton
  - [x] A.1 Provision Node/Express service using existing scaffolding; wire mTLS auth middleware and request ID propagation.
  - [x] A.2 Write 2-4 smoke tests (e.g., health endpoint, authentication rejection) and run only those tests.
  - [x] A.3 Create Docker Compose (API + Redis + Cassandra/Localstack) with seeded configs; document run instructions.
  - [x] A.4 Implement configuration loading (env + secrets) for queue/table names, rate limits, and signing keys.
  - [x] A.5 Ensure service boots locally, returns health 200, and logs structured entries.

**Acceptance Criteria:**
- Service starts via `npm run dev` and `docker compose up`.
- Base tests pass.
- Auth, config, and logging middleware aligned with architecture.md.

### Cursor & Storage Engine

#### Epic B: Cassandra/Redis schemas + cursor lifecycle
**Dependencies:** Epic A

- [ ] B.0 Deliver durable cursor & stream persistence
  - [ ] B.1 Create Cassandra migrations/tables (`pix_streams`, `pix_cursors`, supporting maps) using project’s migration tooling (limit to 2-4 focused migration tests).
  - [ ] B.2 Implement repositories/gateways for Cassandra + Redis; include unit tests for serialization and TTL behavior (2-4 tests).
  - [ ] B.3 Build cursor issuance service (pi-pull-next tokens) with signing + Redis cache, following Epic 2 specs.
  - [ ] B.4 Implement thread-slot manager (Redis) enforcing six-slot cap, abandonment cleanup, and telemetry hooks.
  - [ ] B.5 Wire persistence + cursor logic into background workers that assemble batches from queues/storage.

**Acceptance Criteria:**
- Tables exist locally, migrations runnable.
- Cursor tokens validated against signing secret and hashed in DB.
- Thread-slot enforcement proven via unit tests.

### API Endpoints & XML Engine

#### Epic C: `/stream/start` & `/stream/{piPullNext}`
**Dependencies:** Epics A-B

- [ ] C.0 Deliver SPI-faithful streaming endpoints
  - [ ] C.1 Implement controllers + interactors for both endpoints, including auth, rate limiting, and concurrency checks.
  - [ ] C.2 Build XML batching engine referencing `samples/` XSDs; include 2-5 schema validation tests (using fixtures, no external network).
  - [ ] C.3 Add multipart response renderer with boundary metadata, compression negotiation, and headers (`pi-pull-next`, rate limits).
  - [ ] C.4 Implement error handling per spec (429 thread limit, 400 invalid token, 204 empty queue) with structured responses.
  - [ ] C.5 Write integration tests hitting local Redis/Cassandra (using dockerized deps) to verify happy path + empty queue + invalid token scenarios (limit 5 tests).

**Acceptance Criteria:**
- Endpoints respond per contract.
- Tests cover main flows without exhaustive permutations.
- XML output validated against pacs XSDs.

### Observability & Operations

#### Epic D: Monitoring, rate limiting, and runbooks
**Dependencies:** Epics A-C

- [ ] D.0 Instrument and operationalize the service
  - [ ] D.1 Emit metrics/traces/logs defined in spec; add 2-4 tests ensuring middleware emits counters for key paths.
  - [ ] D.2 Implement Redis-backed sliding-window rate limiting plus adaptive backpressure headers.
  - [ ] D.3 Add admin endpoints/CLI hooks for tenant onboarding, cursor reset, and thread-slot overrides (auth-protected).
  - [ ] D.4 Wire alert hooks (OpenTelemetry exporters) and document runbooks inside `docs/runbooks/`.
  - [ ] D.5 Verify docker-compose smoke test: run soak script that hits endpoints and collects metrics snapshot.

**Acceptance Criteria:**
- Metrics visible locally (e.g., via logs/exporter).
- Admin tools usable with documentation.
- Rate limiting/backpressure enforced with clear client guidance.

## Execution Order
1. Epic A — Backend Foundation
2. Epic B — Cursor & Storage Engine
3. Epic C — API Endpoints & XML Engine
4. Epic D — Observability & Operations

Use `/implement-tasks` with this file to drive the coding phase.
