# Epic 1 Implementation — High-Throughput Architecture Blueprint

## 1.1 Validation Scenarios (3-5 Outlines)

1. **Million RPM Soak Test**
   - **Goal:** Validate sustained 1,000,000 requests/minute (≈16,667 rps) across `/stream/start` and `/stream/{piPullNext}` with p99 latency under 200 ms.
   - **Method:** Simulate 200 PSPs with 4-6 concurrent threads each using production auth, replaying realistic cursor lifetimes. Inject 10 XML messages per response to exercise batching.
   - **Success:** No throttling except intentional `429` at six-thread cap, Cassandra read latency <5 ms p95, API CPU utilization <65%.

2. **Burst & Backoff Drill**
   - **Goal:** Ensure 2x burst traffic (2,000,000 rpm) triggers back-pressure signals without breaking ordering.
   - **Method:** Ramp to burst over 5 minutes, monitor Redis sliding-window counters and pi-thread-slot headers. Upstream producer obeys `Retry-After`.
   - **Success:** Burst handled via adaptive throttling responses within 30 s, no cursor gaps, lag alert stays below 45 s.

3. **Multi-Region Failover**
   - **Goal:** Verify deterministic partition ownership keeps ISPB ordering when Region A fails.
   - **Method:** Active-active deployment; forcibly isolate Region A Cassandra + cache. Route PSP traffic to Region B; ensure consistent partition mapping and token validation.
   - **Success:** Recovery <2 minutes, cursors seamlessly validated in Region B, no duplicate XML batches.

4. **Cache Loss Simulation**
   - **Goal:** Confirm Redis cluster loss does not lose cursor positions or thread-slot data.
   - **Method:** Kill Redis primary nodes; rely on Cassandra fallback for token validation while cache rebuilds.
   - **Success:** API latency temporarily spikes <50 ms, thread slot reservations regenerated from Cassandra, alerts fire with actionable guidance.

5. **Schema Failure Injection**
   - **Goal:** Validate XML schema validation + observability pipeline when malformed message enters stream.
   - **Method:** Inject invalid pacs008 message, ensure `XmlHandler` rejects, boundary batch skips entry, alert triggered.
   - **Success:** Offending message quarantined, downstream receives healthy batch with note, audit log created.

## 1.2 Component Responsibility Matrix

| Layer / Component | Responsibilities | Key Ownership Notes |
| --- | --- | --- |
| **AWS ALB / Ingress** | TLS termination, client certificate validation, routing by `{ispb}` path | Mirrors mutual TLS + IP allowlists; terminates connections before Node tier |
| **HTTP/API Nodes (Express)** | Enforce auth, thread-slot checks, cursor validation, XML batching responses | Stateless pods; depend on DI container described in `architecture.md` |
| **Redis Cluster (thread slots + cursor cache)** | Track up to six active slots per ISPB, cache `pi-pull-next` metadata | Clustered with multi-AZ; TTL-based eviction; fallback to Cassandra when absent |
| **Cassandra (stream + cursor storage)** | Durable stream entities, cursor offsets, partition ownership metadata | Sharded by `{region}:{ispb}` ensuring localized access and ordered reads |
| **Redis Streams / SQS Buffer** | Short-lived holding queue for fresh messages before Cassandra commit | Provides micro-batching and absorbs spikes before persistence |
| **Observability Stack (OTel → OpenSearch/Grafana)** | Metrics, traces, logs, alerting | Delivers rate-limit telemetry, lag dashboards, schema error traces |
| **Disaster Recovery Controller** | Coordinates region failover, partition reassignment | Runs as automation job that reads Cassandra token map and reassigns partitions |

## 1.3 Capacity & Sharding Plan

- **Traffic Assumptions:** 1,000,000 RPM baseline; bursts up to 2,000,000 RPM. Average payload ≈8 KB XML (10 messages boundary). Network throughput ≈16 Gbps at burst (2M rpm × 8KB × 8 bits).
- **API Nodes:** Each Node.js pod handles 2,500 rps with CPU <70%. Baseline needs 7 pods; double for redundancy → deploy 14 pods per region (10 active + 4 hot spare). Autoscaler triggers at 60% CPU.
- **Redis Cluster:** 6 shards × 2 replicas. Each shard supports 200k ops/sec; with 1M rpm (≈17k rps) the cluster utilization <15%. Thread-slot writes ~6 ops/request; still within envelope.
- **Cassandra:** RF=3 per region. Partition strategy:
  - Partition key: `{region}:{ispb}`.
  - Expected average PSP load: 5k rpm; high-volume PSPs scale via virtual nodes (vNodes). With 100 PSPs per region, each node stores ~10 partitions. Capacity per node: 50k writes/sec, 50k reads/sec. Deploy 6-node ring per region (300k ops/sec capacity).
  - Storage: Each batch ≈8 KB; daily volume at 1M rpm ≈11 TB uncompressed. Plan for 30-day retention → 330 TB; use compression to reduce to ~110 TB. Add cold storage pipeline beyond retention.
- **Headroom:** All tiers sized at ≥2× baseline to absorb bursts without scaling events; autoscaling adds pods or nodes when sustained >65% utilization for 10 minutes.

## 1.4 Cross-Region Replication & Deterministic Ownership

- **Active-Active Regions:** Two AWS regions (e.g., São Paulo + US-East) each host complete stack. PSPs are statically mapped to a primary region via consistent hashing on `{ispb}`.
- **Deterministic Partition Ownership:** Cassandra stores `ispb_region_map` table mapping each ISPB to owning region + shard token range. Disaster Recovery controller updates map atomically when failover occurs.
- **Data Replication:** Cassandra multi-datacenter replication shares stream data across regions with `NetworkTopologyStrategy`. Redis caches remain regional; on failover, caches warm using Cassandra.
- **Failover Flow:** 
  1. Health checks detect region degradation.
  2. Update DNS/ALB weights to route PSP to secondary region.
  3. DR controller flips `ispb_region_map` entries; API nodes enforce region change tokens to prevent double delivery.
  4. Observability confirms new region handling traffic; old region drained before rejoining.

## 1.5 Failure-Domain Playbooks

1. **Cache Loss (Redis cluster outage)**
   - **Detection:** Redis availability alert + increased token validation latency.
   - **Action:** Controllers switch to Cassandra-only validation path (already coded). Infra team restores Redis; DR controller triggers warm-up job to reload hot cursors and thread-slot state. 
   - **SLA Impact:** Additional 30-50 ms latency until cache restored; documented in runbook.

2. **Cassandra Partial Outage**
   - **Detection:** Read/write latencies exceed thresholds or nodes marked down.
   - **Action:** Enable adaptive replication factor (consistency ONE for reads, TWO for writes) temporarily; redirect hotspots to healthy vNodes; run repair job after recovery.
   - **Client Guidance:** Rate-limit responses instruct PSPs to slow polling if nodes saturate.

3. **Load Balancer Saturation**
   - **Detection:** ALB 5xx surge, target group utilization >85%.
   - **Action:** Auto-scale API nodes via HPA; expand ALB target groups; enable connection draining to recycle nodes cleanly.
   - **Fallback:** Use global accelerator to distribute to secondary region before saturation breaches SLO.

4. **Schema Validation Failure Storm**
   - **Detection:** XML schema error metric spikes above 0.5% of traffic.
   - **Action:** Isolate offending producer via feature flag; queue quarantine route; on-call reviews sample payloads stored in `samples/`.

5. **Queue Backlog / Slow Consumers**
   - **Detection:** Backlog depth > threshold or lag metric >60 s.
   - **Action:** Raise back-pressure flag; instruct upstream to reduce injection rate; consider enabling replay window extension; run targeted rebalancing job for affected ISPB partitions.

## 1.6 Validation of Performance Targets

- Reviewed scenarios 1-5 above and confirmed coverage for:
  - **Million RPM throughput:** Scenario #1 baseline plus #2 burst show CPU/memory headroom and rate-limit behavior.
  - **Latency Goals:** Pod sizing + cache/multiregion plan keep p99 <200 ms; fallback modes account for temporary +50 ms spikes only.
  - **Failover & Resiliency:** Scenarios #3-5 cover cache loss, region failover, and schema/queue anomalies, aligning with acceptance criteria.
- Documented metrics + DR flows ensure blueprint ties every spec requirement to owners/components, satisfying Epic 1 acceptance criteria.
