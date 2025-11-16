# Epic 3 Implementation — Endpoint & Payload Design

## 3.1 Contract Test Scenarios

1. **Happy Path `/stream/start` + `/stream/{piPullNext}`**
   - Sequence: PSP authenticates → `/stream/start` (returns 200, XML batch, header `pi-pull-next: token_v1`) → `/stream/{token_v1}` returns next batch with `token_v2`.
   - Assertions: Headers include `pi-thread-slot`, `X-RateLimit-*`; body contains multipart boundaries with ≤10 messages.

2. **Empty Queue Handling**
   - `/stream/start` invoked when no pending messages. Response: `204 No Content`, headers still include newest `pi-pull-next` so client can poll later.

3. **Invalid Cursor (`400`)**
   - PSP sends `/stream/{token_v0}` where token signature mismatch occurs. API responds `400` with error payload `{"code":"INVALID_PI_PULL_NEXT"}` and instructions to restart.

4. **Concurrency Limit (`429`)**
   - Seventh parallel request detected by thread-slot service. Response: `429 Too Many Requests`, headers `Retry-After`, `pi-thread-slot: 6/6`.

5. **Unauthorized / Expired Token (`401`)**
   - Expired `pi-pull-next` token results in `401` with `WWW-Authenticate: PI-PULL realm="Pix"` header and call to `/stream/start`.

## 3.2 Request / Response Specs

### `GET /api/v1/out/{ispb}/stream/start`
- **Headers (Request):**
  - `Authorization: Bearer <token>` or mTLS client cert per architecture standard.
  - `x-client-id`, `Accept: application/xml`, optional `Accept-Encoding: gzip`.
- **Response:**
  - Status: `200` or `204`.
  - Headers: `pi-pull-next`, `pi-thread-slot`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Content-Type: multipart/mixed; boundary=PIX-STREAM`.
  - Body (200): Multipart segments, each containing XML message; 204 returns empty body.

### `GET /api/v1/out/{ispb}/stream/{piPullNext}`
- **Headers (Request):**
  - Same as `/stream/start`, plus `If-Match: <token_hash>` optional for extra safety.
- **Response:**
  - Status: `200` (batch), `204` (no messages), `400/401/404/429` based on errors, `503` for backend failure.
  - Headers identical plus `pi-pull-next` representing new cursor.

## 3.3 XML Boundary Structure & Sample

- Use multipart/mixed style:
  ```
  --PIX-STREAM
  Content-Type: application/xml; charset=utf-8
  Content-ID: <ispb:stream_id:seq>

  <?xml version="1.0" encoding="UTF-8"?>
  <PixMessage>
    <!-- pacs008/pacs002/pibr002 payload -->
  </PixMessage>
  --PIX-STREAM--
  ```
- Each segment includes metadata headers:
  - `X-Pix-Message-Type` (pacs008, pacs002, pibr002)
  - `X-Pix-Sequence` (1-10)
  - `X-Pix-EndToEndId`
- Validate payloads against the XSDs stored in `agent-os/standards/backend/samples/`.
- Provide sample annotated payload referencing `pacs008-sample.xml` and `pacs002-sample.xml` for content expectations.

## 3.4 Error Handling Matrix

| Scenario | Status | Body | Headers | Observability Hook |
| --- | --- | --- | --- | --- |
| Invalid/expired `pi-pull-next` | 400 / 401 | `{"code":"INVALID_PI_PULL_NEXT","message":"Restart via /stream/start"}` | `WWW-Authenticate`, `pi-thread-slot` | Metric `cursor.invalid`, log with token hash |
| Missing ISPB / unauthorized | 404 / 401 | `{"code":"UNKNOWN_ISPB"}` | None | Audit log + alert |
| Thread limit exceeded | 429 | `{"code":"THREAD_LIMIT","message":"6 concurrent threads allowed"}` | `Retry-After`, `pi-thread-slot: 6/6` | Metric `thread.limit.hit`, alert |
| Rate limit exceeded | 429 | `{"code":"RATE_LIMIT","retry_after":seconds}` | `X-RateLimit-*` | Metric `rate.limit.hit` |
| Schema validation failure | 500 (batch flagged) | `{"code":"SCHEMA_ERROR","message":"Message quarantined"}` | `pi-pull-next` unchanged | Metric `xml.schema.failure`, send trace |
| Backend storage failure | 503 | `{"code":"BACKEND_UNAVAILABLE","message":"Retry later"}` | `Retry-After` | Alert + DR runbook |

## 3.5 Compression, Idempotency, Resume Logic

- **Compression:** Honor `Accept-Encoding`. If `gzip` present, compress entire multipart body; still include boundary markers post-compression. Add `Content-Encoding: gzip`.
- **Idempotency:** Reusing same `pi-pull-next` token returns identical payload until new token issued. Responses include `ETag` computed from cursor hash so clients can verify duplicates.
- **Resume After Downtime:** Clients persist latest `pi-pull-next`. After outage, call `/stream/{last_token}`; if expired -> `/stream/start` to seed new cursor. Provide docs emphasizing storing token + associated batch metadata for replay.
- **Backoff Guidance:** `Retry-After` + `X-Backpressure-Signal` header instructs clients when to slow down if system under stress.

## 3.6 XML Compatibility Review

- Verified that contract tests ensure ≤10 messages per response and boundaries align with SPI expectation.
- Each batch references XSD files; integration harness must run schema validation before shipping.
- Contract tests simulate pacs008 and pacs002 payloads from samples, ensuring compatibility with downstream Pix consumers.
