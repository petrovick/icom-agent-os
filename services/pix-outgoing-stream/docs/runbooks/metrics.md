# Runbook: Metrics & Observability

1. Scrape `/metrics` endpoint via Prometheus to inspect request durations, rate limits, and thread slot usage.
2. If lag metrics exceed thresholds, follow backlog playbook from architecture docs.
3. Use logs (structured JSON) with `requestId` to trace problematic requests end-to-end.
