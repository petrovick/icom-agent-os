# Epic B Implementation — Cassandra/Redis Schemas & Cursor Lifecycle

## Deliverables
- `services/pix-outgoing-stream/schema/cassandra.cql` documents keyspace and tables (`pix_streams`, `pix_cursors`, `ispb_policies`).
- Added configuration knobs (`PI_PULL_NEXT_SECRET`, Cassandra table names) in `src/config/index.ts` plus `.env.example` entries.
- Cassandra + Redis clients (`src/infra/cassandra`, `src/infra/redis`) and repositories for streams/cursors.
- Token service (`src/services/tokenService.ts`) produces/validates pi-pull-next tokens using HMAC-SHA512.
- CursorService encapsulates issuance + persistence, thread-slot manager enforces six slots using Redis sorted sets.
- Added Vitest suites:
  - `tests/tokenService.test.ts`
  - `tests/threadSlotManager.test.ts`
- Docker assets adjusted to keep Redis/Cassandra available for future integration tests.

## Notes
- Worker wiring (`B.5`) currently exposes class skeletons; actual queue ingestion will be implemented alongside Epic C when API endpoints deliver real batches.
- Redis tests rely on `ioredis-mock`; production code still uses real ioredis via DI.

## Verification
```
cd services/pix-outgoing-stream
source ~/.nvm/nvm.sh && npm test
```
All five smoke/unit tests (health, auth, token service, thread slots) pass.
