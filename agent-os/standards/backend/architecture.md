# ICOM Reflect – Architecture and Communication Guide

This document summarizes how the project is wired so you can lift the same patterns into another agent-os codebase. Each section references the TypeScript sources that implement the feature so that you can quickly trace the call graph end‑to‑end.

## Glossary

- **PI**: Pagamentos Instantâneos, Brazil’s Instant Payment infrastructure.
- **pacs008 / pacs002 / pacs004**: SPI ISO-20022 message types for credit transfers, status reports, and returns, respectively.
- **pibr001 / pibr002**: Echo request/response connectivity tests used by SPI.
- **TxId**: Transaction identifier that prefixes generated txids with `TXID`.
- **EndToEndId**: SPI identifier built via `generateEndToEndId`, used as Dynamo primary key.
- **PI Pull-Next**: Stream identifier returned to PSPs so they can fetch batched XML messages.
- **Stream**: Dynamo entry with a UUID plus the XML messages (pacs/pibr) bundled for a pull-next cycle.

## Runtime Entry & Dependency Injection

- `src/app.ts` boots the process: it sets TLS/env defaults, loads config, and creates the Awilix container via `setupContainer`. When the `--httpServer` flag is provided a single Express HTTP server is started (`startHttpServer`).  
- The DI container (`src/infra/bootstrap/register.ts`) registers every shared dependency (`AWS`, `Ajv`, `Logger`, handlers, repositories) as scoped/singleton values and then recursively `loadModules` all compiled JS files under `interactors`, `adapters/gateways`, `adapters/handlers`, and `adapters/repositories`. The naming convention enforced by Awilix means each `.bs.ts` business service or `.impl.ts` gateway is automatically injectable using its camelCase file name (`generatePaymentMockBs`, `generatePaymentMockImpl`, etc.).  
- `AppContainer` (also in `register.ts`) is the type that lists every injectable so all business services receive the same toolbox. Because `DefaultInteractorGatewayImpl` already wires the repositories + handlers, most use cases just extend it instead of wiring infrastructure manually.  
- A per-request container scope is created in `infra/http/middlewares/request-id.ts`. The middleware clones the root container, injects a unique `requestId`, and stores the scoped container on `req.container`, which controllers use to resolve the business services needed to handle that request.

## Configuration & Environment

- `src/infra/config/config.ts` resolves runtime configuration from AWS SSM parameter store (production) or `infra/config/git-ignored/config.json` (local). Config carries queue URLs, DynamoDB table names, KMS key ids, logging metadata, and the default mock txid counter (`mockReceivePix.lastTransactionId`).  
- Because `getConfig` injects the timezone and optionally points the AWS SDK at Localstack endpoints, every component that depends on AWS services can rely solely on the injected SDK clients (`dynamoDB`, `sqs`, `kms`, `s3`, etc.) that the container builds once.

## HTTP Layer

- `src/infra/http/http-server.ts` configures Express with compression, raw XML bodies (`bodyParser.raw({ type: 'application/xml' })`), and middlewares for logging, request id propagation, IPv4 detection, and centralized error handling. Routes are bound in `src/infra/http/routes.ts`.  
- Controllers live under `src/adapters/controllers/`. Every controller resolves a business service out of `req.container` and never instantiates dependencies by hand. The available endpoints are:
  - POST `/api/v1/in/09089356/msgs` → `input.http.ctrl.ts` handles inbound SPI XML.
  - GET `/api/v1/out/.../stream/*` → `stream.http.ctrl.ts` exposes the pull API used by BC for PI streams.
  - GET `/api/v1/generate-mocked-payments`, `/api/v1/generate-static-mocked-payments`, and `/api/v1/mock/last-txid/:txid` → `generate-payment-mock.http.ts` drives the mock payment tooling.

## System Topology

- **HTTP Server**: Single Express instance (raw XML body parser) exposing inbound SPI webhook, outbound stream endpoints, and mock helpers. Each request spins a scoped Awilix container so dependencies remain per-request.
- **Queues**: `config.queues.pacs008` receives mocked payments and outbound traffic; `config.queues.confirmation` carries pacs002 confirmations plus pibr echoes. Interactors use `SqsHandler` exclusively.
- **Dynamo Tables**: `spiTransactionTable` stores every `TransactionEntity` keyed by `endToEndId`; `spiStreamTable` stores stream bundles keyed by UUID plus optional `pi_pull_next_id`.
- **Workers/Interactors**: `GeneratePiPullNextBs` is the orchestrator that reads both queues, persists transactions/streams, and feeds the outbound HTTP stream use cases. Other interactors (`SetTransactionStatusBs`, `IcomInputBs`, mock generators) feed or consume the same queues/tables.
- **Handlers**: `SpiMessageBuilderHandler`, `XmlHandler`, `DateHandler`, and `TranslatorHandler` sit between gateways and raw infrastructure so business logic never talks to SDKs directly.

## Layered Pattern (Controllers → Interactors → Gateways → Infrastructure)

- **Controllers** translate HTTP requests into DTOs and call a `.execute()` method on the proper interactor.  
- **Interactors (Business Services)** live under `src/interactors/**`. Each `*.bs.ts` file encapsulates a use case, receives `AppContainer` in the constructor, and only uses the narrow gateway interface defined next to it (e.g., `GeneratePaymentMockGateway`). This keeps orchestration (logging, timing, branching, async coordination) separate from infrastructure.  
- **Gateway Interfaces & DefaultInteractorGateway**: `src/interactors/default-interactor.types.ts` declares the set of infrastructure operations that any interactor can request (SQS send/receive, Dynamo CRUD, XML creation, etc.). `DefaultInteractorGatewayImpl` (`src/adapters/gateways/default-interactor-gateway.impl.ts`) implements those methods by composing repositories (`StreamRepository`, `TransactionRepository`) and handlers (`SqsHandler`, `SpiMessageBuilderHandler`). Specific gateways such as `generate-payment-mock.impl.ts` extend it and add domain-specific helpers (`getTxIds`, `buildTransactionEntity`) on top.  
- **Repositories/Handlers** encapsulate the actual side-effects. `SqsHandler` batches send/delete/visibility operations, `StreamRepository` and `TransactionRepository` persist JSON blobs in DynamoDB, `XmlHandler` converts XML ↔ JSON, and `SpiMessageBuilderHandler` builds SPI-compliant pacs/pibr payloads. Because all gateways inherit `DefaultInteractorGatewayImpl`, any interactor automatically has access to these capabilities through its gateway.

## Domain Entities & Utilities

- `src/entities/transaction.entity.ts` defines `TransactionEntity`, `TransactionStatusEntity`, and `EchoTestEntity`. These are the core payloads moving through queues, Dynamo, and HTTP responses.  
- `src/entities/stream.entity.ts` defines `StreamEntity` (a `uuid`, optional `piPullNextId`, and an array of `MessageXmlEntity` objects). Streams are persisted wholesale in Dynamo so that `GET /stream/:uuid` can replay exactly what was bundled during generation.  
- Utilities in `src/adapters/handlers/utils.handler.ts` centralize validators, batching (`arrayBatch`), ID generators (`generateMessageId`, `generateResourceId`, `generateEndToEndId`), and helper predicates so every interactor builds messages the same way. Date math is handled by `DateHandler`, while XML parsing/validation lives in `XmlHandler`.

## Example Flow: `/api/v1/generate-mocked-payments`

1. **Controller** (`src/adapters/controllers/generate-payment-mock.http.ts`) reads query params (`repetitions`, `numberOfTxIds`, `delaySeconds`, `synchronous`) and resolves `generatePaymentMockBs`. It invokes `.execute(input)` the requested number of times.  
2. **Interactor** (`src/interactors/mock-receive-payments/generate-payment-mock/generate-payment-mock.bs.ts`) logs the request, asks its gateway for sequential txids (`getTxIds`), builds SQS entries (`buildMessages`), and sends them to the PACS008 queue (`getQueueUrl` → `config.queues.pacs008`). The send happens asynchronously; completion and failures are logged.  
3. **Gateway** (`src/adapters/gateways/generate-payment-mock.impl.ts`) extends `DefaultInteractorGatewayImpl` so it inherits `sendMessageBatch`. It maintains a static `currentTxIdIndex` initialized from config, exposes `/mock/last-txid` via `SetLastTxidBs`, and constructs `TransactionEntity` objects populated with deterministic participant/account data, ISO date strings supplied by `DateHandler`, and SPI IDs generated with `crypto` + helpers.  
4. **Infrastructure** (`SqsHandler.sendMessageBatch`) chunks messages in groups of 10 and pushes them to AWS/Localstack. From here, the standard outbound processing kicks in (`GeneratePiPullNextBs` eventually reads the queue, persists streams, and exposes them through the streaming endpoints).

The static variant (`generate-static-payment-mock.bs.ts` + `generate-static-payment-mock.impl.ts`) reuses the same pattern but always emits the same transactionId, and `set-last-txid` is a thin interactor over the same gateway that just resets `currentTxIdIndex`.

> **Async behavior**: `GeneratePaymentMockBs.execute` intentionally does not `await` `sendMessageBatch`. If your downstream system must know when SQS is finished before returning HTTP 200, wrap the `.sendMessageBatch` call in `await` or collect the promises and `Promise.all` them inside the controller (see `generate-payment-mock.http.ts` for the sync/async flag).

## Stream Lifecycle & PI Pull-Next

1. **Start** (`StartStreamBs` in `src/interactors/icom/stream/start/start-stream.bs.ts`) simply proxies to `GeneratePiPullNextBs.execute` and returns the resulting `piPullNextId` so the HTTP controller can prime response headers.  
2. **Generate** (`src/interactors/icom/stream/common/generate-pi-pull-next/generate-pi-pull-next.bs.ts`) is responsible for reading both queues, grouping messages, and persisting the stream:
   - Pulls batches from PACS008 (`config.queues.pacs008`) and Confirmation (`config.queues.confirmation`) through the gateway’s `receiverMessages`.
   - Converts raw `SQS.Message` objects into `TransactionEntity` instances and splits them into “on-time” and “timeout” buckets by comparing `acceptanceDateTime` against `Date.now()`.
   - Persists fresh transactions in Dynamo via `gateway.createTransactions` and makes timed-out messages visible again (`changeMessagesVisibility`). Transactions older than 40s are marked rejected (`setTransactionTimeout` → `SetTransactionStatusBs`).
   - Builds an array of `MessageXmlEntity` by batching up to 10 transactions per pacs008/pacs002 message and adding any echo replies (`pibr002`).  
   - Creates the `StreamEntity` (uuid, message list) in Dynamo using `StreamRepository`. Confirmation messages are deleted from SQS once they are captured. The method ultimately returns the stream UUID, which is the “pi-pull-next” id.
3. **Get** (`src/interactors/icom/stream/get/get-stream.bs.ts`) loads the stream by UUID, lazily generates and persists a `piPullNextId` if one was not yet assigned, and runs each `MessageXmlEntity` through `gateway.createXml`. That helper delegates to `SpiMessageBuilderHandler`, which constructs SPI-compliant pacs/pibr XML documents (including AppHdr, signatures, etc.). The HTTP controller (`stream.http.ctrl.ts`) wraps those XML strings in a multi-part boundary response that mimics SPI’s chunked format, adding `pi-pull-next` headers built from `generateResourceId`.  
4. **Delete** (`src/interactors/icom/stream/delete/delete-stream.bs.ts`) looks up the stream, filters the pacs008 messages, and resets their SQS visibility to zero so they can be reprocessed if the consumer fails to finalize. Changing visibility rather than deleting keeps the queue state consistent.

## Inbound SPI Input (`/api/v1/in/.../msgs`)

- The controller resolves `IcomInputBs` (`src/interactors/icom/input/icom-input.bs.ts`) and passes the raw XML bytes captured by Express’ raw body parser.  
- `IcomInputBs` leverages `XmlHandler` to parse the payload and inspects `AppHdr.MsgDefIdr` to determine the message type. It produces a `MessageXmlEntity` describing either pacs002 (status reports), pacs008 (credits), pacs004 (returns), or pibr001 (echo tests).  
- Depending on the type:
  - **pacs002/pacs004**: It fetches the matching transaction from Dynamo via `gateway.getTransaction` and either schedules a confirmation (`sendPacs002WithTransactionStatus`) or enriches the transaction with timeout rejection data before delegating to `SetTransactionStatusBs`.  
  - **pacs008**: Immediately acknowledges by enqueuing pacs002 confirmations for each end-to-end id.  
  - **pibr001**: Creates an echo reply (messageType `pibr002`) and pushes it to the confirmation queue.  
- Throughout the process the interactor logs elapsed time metrics via `this.logger` so operational tooling can trace long-running steps.

## Transaction Status Management

- `SetTransactionStatusBs` (`src/interactors/icom/common/set-transaction-status/set-transaction-status.bs.ts`) is the cross-cutting use case that updates Dynamo and queues confirmations. It uses `SetTransactionStatusImpl` (which inherits `DefaultInteractorGatewayImpl`) so `setTransactionStatus`, `sendMessageBatch`, and `deleteMessageBatch` all piggyback on the same repository/handler plumbing.  
- After writing the updated transactions back to Dynamo the interactor:
  1. Sends pacs002 “confirmation” messages to `config.queues.confirmation`, serializing the `transaction.transactionStatus` entries as the SQS message body.
  2. Deletes the original pacs008 messages from the outbound queue using their stored `receiptHandle`.  
- Both operations are fired concurrently via `Promise.all`. Because `TransactionEntity` carries the `receiptHandle` captured when `GeneratePiPullNextBs` first read the queue, the delete operation knows exactly which SQS message to remove.

## Shared Infrastructure Pieces

- **SQS Handler (`src/adapters/handlers/sqs.handler.ts`)**: wraps AWS SQS SDK calls and enforces consistent batching (10 entries per batch). Every gateway composes it through `DefaultInteractorGatewayImpl`.  
- **Dynamo Repositories**: `StreamRepository` stores stream blobs keyed by UUID; `TransactionRepository` stores transactions keyed by `endToEndId` (`id_reference`). Both accept the AWS DynamoDB client + table names via DI and serialize payloads as JSON strings.  
- **XML & Message Builders**: `XmlHandler` converts XML to JSON and validates payloads against bundled XSDs. `SpiMessageBuilderHandler` is a large helper that produces pacs002/pacs008/pibr002 envelopes using translator functions (`TranslatorHandler`). This is how `GetStreamBs` can emit ready-to-deliver SPI XML without each interactor knowing the schema.  
- **Utility Handlers**: `DateHandler` centralizes timezone logic and timestamp formatting; `utils.handler.ts` contains validation helpers, message-id generators, CRC calculators, etc. `generateResourceId()` and `generateMessageId()` are reused in controllers and interactors so outbound traffic follows SPI naming rules.

### Sample XML Payloads

- Canonical SPI XML examples live under `agent-os/standards/backend/samples/`.
-  - `samples/pacs008-sample.xml` — populate with the outbound credit transfer (FIToFICstmrCdtTrf) envelope the stream endpoints must emit.
-  - `samples/pacs002-sample.xml` — populate with the status report response (FIToFIPmtStsRpt) used for confirmations.
-  - `samples/pacs.008.spi.1.14.xsd` & `samples/pacs.002.spi.1.15.xsd` — official SPI schemas; sync these with Banco Central releases and validate every XML builder against them.
-  - `samples/PACS008.xlsx` & `samples/PACS002.xlsx` — annotated examples describing required fields, data types, and business rules.
- Keep these files synchronized with whatever schemas the `XmlHandler` validates against so future specs/tests reference an authoritative payload.

### Local Validation & Docker

- The entire stack must remain runnable via Docker Compose (or equivalent container tooling) so engineers can validate Pix flows locally.
- Compose file should bring up Express API nodes, Redis cluster, Cassandra (or Localstack), and supporting queues with seed data matching the samples above.
- Local runs should expose smoke-test scripts that replay the validation scenarios (reduced scale) to verify ordering, XML batching, and observability before promoting changes.

## Observability & Telemetry

- **Metrics**: Controllers and interactors emit counters/timers through `TelemetryHandler` (OpenTelemetry exporter). Minimum set: request rate per ISPB, queue depth/lag, cursor churn, XML schema failures, thread slot usage, and rate-limit hits. Dashboards in OpenSearch/Grafana consume these metrics for SLA tracking.
- **Tracing**: The scoped Awilix container injects `traceSpan` helpers so a single trace follows HTTP → interactor → gateway → AWS SDK call. Correlation IDs bubble up via `requestId` to logs and responses.
- **Logging**: `LoggerHandler` enforces structured logs containing `requestId`, `ispb`, `piPullNext`, `threadSlot`, and status codes. Mask sensitive payloads before logging; rely on `maskFields` helper baked into the logger.
- **Alerting**: Alert definitions cover lag thresholds (>60s), XML schema error streaks, cache eviction spikes, and concurrency violations. Alerts page on-call engineers via GitHub Actions integrations and link to runbooks stored in `docs/runbooks/`.

## Rate Limiting & Backpressure

- **Thread Slots**: `ThreadSlotService` (Redis-backed) tracks the six-thread cap per ISPB. `/stream/*` controllers must reserve a slot before hitting interactors; rejections return `429` with `Retry-After` headers and telemetry increments.
- **Sliding Windows**: A Redis LUA script enforces per-ISPB RPM ceilings. When hit, controllers emit structured `429` responses and annotate logs with reason codes, helping PSPs tune their poll cadence.
- **Backpressure Flags**: `GeneratePiPullNextBs` checks Dynamo/SQS depth and cursor lag. When thresholds are exceeded it sets a “slow consumer” flag consumed by controllers and upstream producers, triggering exponential backoff and optional queue visibility adjustments.
- **Producer Coordination**: Inbound SPI adapters and mock generators inspect the same flag to slow message injection, preventing runaway backlog conditions.

## Error Handling & Recovery

- **HTTP Layer**: `error-handler.ts` normalizes controller failures. Business errors map to 4xx codes with SPI-aligned error bodies; unexpected exceptions become 5xx with stack traces logged (never returned).
- **Gateway Layer**: AWS SDK wrappers retry transient throttles with jitter. Persistent failures bubble up as typed errors so controllers can return `503` plus `Retry-After` headers per backend/error-handling standard.
- **Idempotent Interactors**: Every use case stores dedupe identifiers (TxId, EndToEndId, piPullNext). Retries re-check state before mutating to preserve exactly-once semantics across queue replays.
- **Runbooks**: `docs/runbooks/` holds procedures for XML schema failures, Redis evictions, Dynamo hot partitions, and cursor corruption. Each runbook references the owning handler/interactor defined in this architecture file for faster diagnosis.

## AWS Resources & Queues

- The project assumes two queues (`config.queues.pacs008` and `config.queues.confirmation`) and two Dynamo tables (`config.dynamoDbTables.spiStreamTable`, `config.dynamoDbTables.spiTransactionTable`). Local development points all AWS SDK clients at Localstack.  
- Every queue/table is only accessed through the gateway/repository abstractions, so when porting this architecture you can swap implementation details (e.g., another queue provider) by editing the handlers rather than every interactor.

## Extending the System

1. Define the DTO + Gateway interface next to your interactor (see `generate-payment-mock.types.bs.ts`).  
2. Implement the business logic in a `*.bs.ts` class that depends on the gateway only through that interface. Resolve loggers/config/handlers out of the constructor parameters as needed.  
3. Either implement a brand-new gateway or extend `DefaultInteractorGatewayImpl` if you need access to SQS/Dynamo helpers. Register any new repositories/handlers in `setupContainer` so they decorate the container.  
4. Expose the interactor from a controller (HTTP, SQS consumer, cron) by resolving it from `req.container`. Because controllers never call `new`, new features remain testable and DI-friendly.  
5. When you need to trace a flow, follow the same pattern shown above for `generate-payment-mock`: **route → controller → interactor → gateway → handler/repository**. File naming makes this mapping trivial (e.g., `some-feature.bs.ts` will depend on `some-feature.impl.ts`).

By replicating these boundaries (controllers → interactor services → gateways → repositories/handlers) and sticking to the shared entities/utilities, another project can implement the same SPI mock features while remaining decoupled from AWS and keeping business logic free of infrastructure code.
