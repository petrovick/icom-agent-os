# Tech Stack — Pix Outgoing Stream Pull API

## Application & Runtime
- **Language & Runtime:** Node.js (LTS) running on a hardened, containerized environment for consistent deployment.
- **Framework:** Express-based HTTP service tuned for long-polling workloads; aligns with standard backend stack.
- **Package Manager:** npm with workspace scripts for linting, testing, and service orchestration.

## Data & Streaming
- **Primary Message Store:** Cassandra clusters sharded by ISPB + partition keys to sustain millions of ordered writes/reads per minute.
- **Streaming/Queue Layer:** Redis Streams or equivalent append-only log to buffer outbound Pix messages before persistence and cursor assignment.
- **Relational Metadata Store:** MySQL (managed) for configuration, throttling policies, and operational metadata.
- **Cursor Cache:** Redis for low-latency lookup/expiry of `pi-pull-next` tokens and thread-slot bookkeeping.

## API & Protocol Concerns
- **HTTP Endpoints:** `/api/v1/out/{ispb}/stream/start` and `/stream/{piPullNext}` implemented with strict XML payload schemas and multipart boundary rendering.
- **Serialization:** XML builders/validators with schema definitions mirroring Banco Central Pix artifacts; automated schema tests ensure compliance.
- **Throttling & Parallelism Controls:** Middleware enforcing six-thread-per-ISPB limit plus adaptive rate limiting/back-pressure responses.

## Observability & Operations
- **Metrics & Tracing:** OpenTelemetry emitters shipped to the standard OpenSearch-based monitoring stack; dashboards keyed per ISPB.
- **Logging:** Structured JSON logs with correlation IDs for each cursor token and boundary batch.
- **Alerting:** GitHub Actions + monitoring rules notify on lag, error-rate, or rate-limit threshold breaches.

## Testing & Quality
- **Unit/Integration Tests:** Native Node.js test runner (tsx) covering cursor lifecycle, XML formatting, and throttling logic.
- **Linting:** ESLint enforcing shared conventions and detecting performance footguns before deployment.
- **Validation Harness:** Contract tests asserting XML schema compliance and Pix-like behavior under concurrent polling.

## Deployment & Infrastructure
- **Hosting:** AWS EKS or ECS running containerized services with autoscaling policies tuned for multi-million RPM load; on-prem fallback available per standard.
- **CI/CD:** GitHub Actions pipelines for lint/test/build/deploy plus load-test stages.
- **Secrets & Config:** Environment variables managed through the existing configuration service; no credentials in code.

## Security & Compliance
- **Authentication:** Mutual TLS or signed tokens per PSP (ISPB) to restrict access to respective streams.
- **Data Protection:** TLS in transit, encrypted Cassandra/Redis volumes at rest, and audit logs for replay actions.
- **Governance:** Access controls and monitoring hooks enabling compliance analysts to replay streams without elevating privileges elsewhere.
