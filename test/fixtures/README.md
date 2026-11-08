# Public API test fixtures

These JSON files were retrieved from the documented public Squeekchain endpoints on 2026-11-08. The event list was reduced to four settlement events and its cursor cleared. They are test inputs only, never imported by the application or served in `dist/`.

- `status.json`: `https://api.squeekchain.com/v1/status` (schema 1).
- `settlements.json`: `https://api.squeekchain.com/v1/settlements?range=7d` (schema 3).
- `events.json`: `https://api.squeekchain.com/v1/events?category=protocol&limit=100` (schema 4).

The browser suite rewrites dates and consumed game values in memory into a fixed, explicitly mocked scenario. This makes closure, polling and resolution testable without waiting for a real round or requiring network access. No fixture response is represented as a live production observation.
