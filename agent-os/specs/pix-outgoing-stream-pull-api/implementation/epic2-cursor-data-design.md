# Epic 2 Implementation — Cursor Semantics, Storage, and Concurrency Modeling

## 2.1 Cursor Invariants & Validation Tests

1. **Fresh Cursor Consumption**
   - Given `/stream/start` issues `pi-pull-next` token `token_v1`, when a PSP immediately calls `/stream/{token_v1}`, the service returns the same batch (up to 10 messages) and a new `pi-pull-next` token `token_v2`, advancing the canonical cursor.
   - Ensures first-use tokens are always valid and ordering is maintained.

2. **Expired Cursor Rejection**
   - `pi-pull-next` token `token_v1` expires after configurable inactivity (default 5 minutes). A PSP using an expired token receives `401` + guidance to restart via `/stream/start`.
   - Validates idle connections cannot stall storage and ensures stale tokens do not regress ordering.

3. **Replay After Failure**
   - PSP uses `pi-pull-next` token `token_v1` but crashes before processing. Retry with the same token must return identical XML batch until PSP acknowledges via next call (`token_v2`).
   - Confirms idempotent delivery and that Cassandra retains undelivered flag until cursor advances.

4. **Concurrency Guardrail**
   - Six concurrent calls with unique thread IDs proceed; a seventh receives `429` and does not advance Cassandra cursor.
   - Demonstrates distributed locking prevents overlapping advancement.

5. **Out-of-Order Token Detection**
   - PSP attempts to use `pi-pull-next` token `token_v1` after consuming `token_v3`. Service detects monotonic sequence mismatch and returns `400` (invalid token).
   - Protects against replaying older cursor states.

## 2.2 Cassandra & Redis Schema Design

### Cassandra Tables

1. **`pix_streams`**
   - **Partition Key:** `region` + `ispb`
   - **Clustering Columns:** `stream_ts` (epoch micros), `stream_id` (UUID)
   - **Columns:** `messages (list<text>)`, `status (text)`, `cursor_seq (bigint)`, `thread_slot (tinyint)`, `delivery_state (map<uuid, text>)`
   - Purpose: Durable storage for batches (10 messages per row) plus metadata for ordering and replay.

2. **`pix_cursors`**
   - **Partition Key:** `region` + `ispb`
   - **Clustering Column:** `thread_slot` (0-5)
   - **Columns:** `cursor_seq`, `cursor_offset`, `token_hash`, `token_expiry`, `last_heartbeat`, `pi_pull_next_id`
   - Purpose: Track canonical cursor per ISPB/thread slot. Token hash allows server-side validation without storing raw tokens.

3. **`ispb_region_map`** (shared with Epic 1)
   - Stores primary/secondary region ownership plus failover timestamps.

### Redis Structures

1. **`cursor:token:{token}` (Hash)**
   - Fields: `ispb`, `thread_slot`, `cursor_seq`, `expiry`, `signature`.
   - TTL aligned with token expiry (≥5 minutes). Provides O(1) validation path.

2. **`cursor:slot:{ispb}` (Sorted Set / Hash)**
   - Tracks active thread slots, storing `client_id`, `last_seen`, `reservation_id`.
   - Used to enforce ≤6 slots and detect abandoned clients.

3. **`cursor:lag:{ispb}` (Stream)**
   - Rolling metrics for last delivered timestamp; powering observability.

## 2.3 Opaque Token Format

- **Structure:** `base64url(header.payload.signature)` representing the pi-pull-next token
  - Header: `{"alg":"HS512","typ":"PI-PULL-NEXT"}`
  - Payload fields:
    - `ispb` (string)
    - `thread` (0-5)
    - `cursor_seq` (incrementing bigint representing pi-pull-next sequence)
    - `cursor_offset` (UUID/reference to `pix_streams.stream_id`)
    - `shard` (region:partition identifier)
    - `exp` (unix timestamp)
    - `issued_at` (unix timestamp)
  - Signature: HMAC-SHA512 over header+payload using KMS-managed secret; rotated every 90 days.
- **Rotation Policy:** Maintain two active secrets (current + previous) to honor in-flight pi-pull-next tokens. Rotate by updating KMS alias and refreshing Express middleware.
- **Tamper Detection:** On API call, decode token, validate signature via KMS, compare hashed payload to Cassandra `token_hash`, and reject mismatches with `401`.

## 2.4 Thread Slot Allocation & Distributed Locking

- **Reservation Flow:**
  1. PSP sends request with `client_id`; middleware checks Redis hash for active slots.
  2. If <6, allocate slot by writing `cursor:slot:{ispb}` with TTL (e.g., 30s) and `reservation_id`.
  3. Attach slot ID to request context.
- **Locking Mechanism:**
  - Use Redis Redlock (3 masters) to guard `cursor:advance:{ispb}:{thread}` during Cassandra updates.
  - Within lock, read `pix_cursors` row, compare `cursor_seq`, and update to next sequence via lightweight transaction (`IF cursor_seq = ?`).
- **Retries:** If lock acquisition fails, respond with `429` or instruct client to retry after jitter.
- **Abandoned Slots:** Background job scans `cursor:slot` TTLs; expired slots release reservation and allow new clients.

## 2.5 Retention & Replay Policies

- **Retention Defaults:** 30 days of outbound Pix messages in Cassandra (`pix_streams`). Configurable per ISPB; values stored in `ispb_policies` table.
- **Legal Holds:** `pix_streams` rows flagged with `legal_hold=true` are exempt from TTL deletion. Admin tooling toggles this per request.
- **Replay Mechanism:** Compliance endpoints can request historical cursor seeds by specifying `{ispb, start_ts, end_ts}`. System generates temporary replay tokens with limited concurrency (1 thread) to avoid interfering with production slots.
- **Storage Growth:** Assuming 1M rpm baseline, 30-day retention ≈110 TB compressed (see Epic 1). Provide automated compaction and archival to object storage for >30 days.
- **Backups:** Nightly snapshots of Cassandra keyspaces + Redis RDB for audit trail.

## 2.6 Validation Walkthrough

- **Invariant Coverage:** Each scenario (2.1) mapped to Cassandra/Redis schemas:
  - Expired tokens validated by comparing `exp` vs. current time and verifying `pix_cursors.token_expiry`.
  - Replay scenario uses `delivery_state` map to ensure messages stay flagged `undelivered` until next token issuance.
  - Concurrency guard uses `cursor:slot` TTL + Redlock to block seventh thread; Cassandra conditional updates prevent cross-slot advancement.
  - Out-of-order detection compares incoming `cursor_seq` to stored value; mismatches trigger invalid token response.
- **Performance Considerations:** Redis caches return validations in <3 ms; Cassandra reads reserved for cache misses. All writes happen within LWT to guarantee ordering while keeping operations localized by partition key.
- **Compliance Hooks:** Audit logs record every token issuance/consumption with hash, timestamps, and `client_id`, satisfying requirement to trace cursor history.
