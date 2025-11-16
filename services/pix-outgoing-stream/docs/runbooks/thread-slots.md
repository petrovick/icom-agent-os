# Runbook: Thread Slot Reset

1. Identify ISPB experiencing stuck thread slots via metrics (`thread.slot.usage`).
2. Use admin endpoint `POST /admin/thread-slots/:ispb/release` with body `{ "clientId": "..." }` to free a slot.
3. If multiple slots stale, run maintenance script that scans Redis sorted sets for expired entries.
4. Inform PSP about actions and remind them to close idle connections.
