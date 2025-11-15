# Product Mission

## Pitch
Pix Outgoing Stream Pull API is a high-throughput Pix-like outgoing message pull platform that helps participant institutions and internal financial services teams keep funds flows synchronized by providing cursor-based, XML streaming access to outbound Pix messages with guaranteed ordering, isolation, and observability.

## Users

### Primary Customers
- **Participant PSPs (ISPBs):** Licensed Pix participants that must ingest outbound Pix events into their own settlement, fraud, or reconciliation stacks without gaps.
- **Internal Financial Operations Teams:** Internal services that represent a PSP or shared-service layer responsible for replay, audit, and compliance views of outgoing Pix traffic.

### User Personas
**Settlement Platform Lead** (30-55)
- **Role:** Leads a PSP's payments platform team.
- **Context:** Runs mission-critical services that must ingest Pix messages with strict ordering into downstream ledgers and reconciliation flows.
- **Pain Points:** Legacy pull jobs drop messages during bursts; limited visibility when lag occurs; multiple regions/ISPBs competing for throughput.
- **Goals:** Consume every outbound Pix message exactly once, scale to millions of polls per minute, and get fast indicators when lag or throttling occurs.

**Operational Compliance Analyst** (28-50)
- **Role:** Oversees audit/compliance tooling for Pix traffic.
- **Context:** Needs controlled replay and monitoring of outgoing Pix messages for investigations and regulatory reporting.
- **Pain Points:** Manual replay tooling is slow, lacks isolation per ISPB, and breaks under concurrent analysts.
- **Goals:** Safely replay or monitor streams without interfering with production consumers while keeping immutable evidence of what was delivered.

## The Problem

### Fragmented Outgoing Pix Delivery
Financial institutions lack a unified, high-performance pull interface that mirrors Banco Central's SPI behavior inside their own architecture. This inconsistency produces delayed settlements, manual reconciliation, and compliance blind spots during traffic spikes, risking SLA breaches and regulatory penalties measured in millions of reais.

**Our Solution:** Provide a Pix-faithful, cursor-based pull API that batches XML responses, isolates tenants per ISPB, and enforces controlled concurrency so every institution can ingest, monitor, and replay outbound Pix messages without data gaps.

## Differentiators

### SPI-Faithful Pull Mechanics
Unlike generic message APIs, we mirror SPI's `/stream/start` and `/stream/{piPullNext}` semantics—including XML boundaries, cursor headers, and six-thread limits—so PSPs can adopt the service without retooling downstream systems. This results in rapid integration, lower migration risk, and provable ordering guarantees.

### Built-In Observability Guardrails
Unlike black-box brokers, every stream exposes per-ISPB metrics, lag indicators, throttling signals, and operational controls. This results in faster incident response, proactive scaling decisions, and easier compliance attestations.

## Key Features

### Core Features
- **Cursor-Based Streaming:** Every response returns `pi-pull-next`, letting PSPs consume messages in-order with zero gaps or duplicates even during bursts.
- **XML Batch Delivery:** Up to 10 Pix messages arrive per response within boundary markers so downstream SPI-compatible parsers can ingest them unchanged.

### Collaboration Features
- **Multi-Tenant Isolation:** Separate `{ispb}` streams enforce rate limits, back-pressure, and audit controls so different PSPs or internal teams cannot impact one another.
- **Controlled Parallel Threads:** Policy-enforced six-thread limit per ISPB supports horizontal processing while preserving ordering and operational safety.

### Advanced Features
- **Operational Observability:** Metrics, logs, and traces per ISPB reveal throughput, lag, and error trends, empowering automation and compliance oversight.
- **Replay & Monitoring Hooks:** Controlled access paths allow analysts to monitor or replay streams without disrupting production consumers, reducing investigation time.
