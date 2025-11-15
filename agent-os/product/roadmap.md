# Product Roadmap

1. [ ] Establish multi-tenant stream service shell — Stand up the high-performance `/api/v1/out/{ispb}` service with basic authn/z, tenant routing, and health checks to host subsequent features. `M`
2. [ ] Implement cursor lifecycle & `/stream/start` — Persist ordered outbound messages, deliver the first 10 via `/stream/start`, and emit the `pi-pull-next` header so PSPs can begin consumption. `M`
3. [ ] Add `/stream/{piPullNext}` continuation flow — Honor incoming cursors, enforce idempotent delivery of batches of 10, and recycle cursors safely for lagging consumers. `M`
4. [ ] XML boundary batching engine — Wrap every payload in Pix-compliant XML with multipart-style boundaries, schema validation, and error handling for malformed payloads. `S`
5. [ ] Controlled parallelism guardrails — Track thread slots per ISPB, enforce the six-thread cap, and add back-pressure/rate-limiting responses without breaking ordering. `S`
6. [ ] Throughput scaling & sharding — Partition message storage and delivery workers, add autoscaling policies, and run load tests proving millions of polls per minute. `L`
7. [ ] Observability & operational console — Emit per-ISPB metrics/logs/traces, expose lag dashboards, and wire throttling controls plus alerts for SLA breaches. `M`
8. [ ] Replay & monitoring access paths — Provide read-only endpoints/controls for compliance teams to monitor or replay streams without impacting production tokens. `S`

> Notes
> - Order flows from establishing the base API to enforcing ordering, packaging, and scaling controls before layering observability and replay hooks.
> - Each item delivers a testable capability that spans API, storage, and operational instrumentation layers.
