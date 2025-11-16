# Runbook: Rate Limit / Backpressure Response

1. Observe alerts from Prometheus (metrics endpoint) indicating repeated `RATE_LIMIT` responses.
2. Inspect Redis `rl` keys to confirm high usage per ISPB/client.
3. Communicate with PSP about observed usage, advise to honor headers.
4. If needed, adjust rate limiter points/duration via environment variables and redeploy.
5. Document actions taken and verify metrics return to normal.
