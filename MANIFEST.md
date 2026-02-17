# Project Manifest

## What Works

- **POST /links** — create short links with 8-char codes, idempotent on targetUrl, handles concurrent race conditions via UNIQUE constraint
- **GET /:shortCode** — 302 redirect to target URL, non-blocking click tracking, async fraud validation with $0.05 reward
- **GET /stats** — paginated global analytics with monthly earnings breakdown per link
- **Atomic double-reward guard** — `UPDATE WHERE rewarded=false RETURNING id` prevents duplicate credits under retries/concurrency
- **Validation** — `@IsUrl()` for link creation, `@Min/@Max` for pagination params
- **Full test suite** — 25 unit tests + 13 e2e tests, all passing
- **Docker** — multi-stage build, Docker Compose with PostgreSQL 16
- **CI** — GitHub Actions pipeline: lint → test → e2e → build → docker build

## What's Missing / Known Limitations

- **No authentication/authorization** — any caller can create links and view stats
- **No rate limiting** — susceptible to abuse without request throttling
- **No caching** — hot short codes hit the DB on every redirect (Redis would help at scale)
- **No link expiration** — short links live forever
- **No seller identity** — links aren't tied to a user/seller entity
- **Fire-and-forget reward** — if the process crashes mid-reward, the click is recorded but the reward may be lost (see Trade-offs)
- **No per-link stats endpoint** — stats are global only (no `GET /links/:id/stats`)

## Database Justification

**PostgreSQL 16** was chosen because:

1. **UNIQUE constraints with conflict detection** — `ON CONFLICT` / error code `23505` enables idempotent link creation without application-level locking
2. **Atomic UPDATE with RETURNING** — the double-reward guard (`UPDATE WHERE rewarded=false RETURNING id`) is a single atomic SQL statement that prevents race conditions
3. **DATE_TRUNC + FILTER aggregation** — PostgreSQL's `FILTER (WHERE ...)` clause with `DATE_TRUNC` enables efficient monthly stats in a single query
4. **Integer arithmetic for money** — storing cents as `INT` avoids floating-point precision issues; PostgreSQL handles this natively

**Schema design**: Two tables (`links` + `clicks`) with denormalized lifetime counters on `links` for O(1) stats reads. Monthly breakdowns computed at query time — simple and correct at demo scale.

## Trade-offs

| Decision | Trade-off |
|---|---|
| **Fire-and-forget async reward** | Fast redirects (~ms), but reward is best-effort. If the process crashes during the 500ms fraud check, the reward is lost. Production fix: use a persistent job queue (Bull + Redis) for guaranteed delivery. |
| **Query-time monthly aggregation** | No extra tables or maintenance. O(n) per page of links at query time. At scale, a materialized view or denormalized `monthly_stats` table would be better. |
| **Denormalized counters on links** | O(1) lifetime stats reads, but requires atomic increments on every valid click. Acceptable trade-off — the write cost is minimal. |
| **`crypto.randomBytes` for short codes** | No external dependency (vs nanoid). 8 chars from base64url = ~48 bits of entropy. Collision probability is negligible (~1 in 281 trillion). |
| **TypeORM `synchronize: true`** | Auto-syncs schema in dev. In production, this should be replaced with migrations for safe, versioned schema changes. |
| **No authentication** | Simplifies the demo. Production would require JWT/session auth + seller identity on links. |

## AI Usage and Prompts

Built with **Claude Code** (Anthropic CLI, Claude Opus model). Key prompts used:

1. **Initial design prompt**: "Propose a backend design + implementation plan for a Fiverr Share & Earn short-links service" — provided full requirements (3 endpoints, fraud validation, concurrency constraints, stats format)

2. **Architecture refinements**:
   - "Store cents in DB, convert on output" — switched from DECIMAL to INT for money
   - "Add atomic guard for double-reward prevention" — added `UPDATE WHERE rewarded=false RETURNING id`
   - "Add composite index clicks(linkId, clickedAt)" — optimized stats aggregation
   - "Normalize targetUrl before insert" — added `.trim()` to prevent duplicates

3. **Testing refinement**: "Don't assert reward/earnings directly in e2e — mock fraud validation to deterministic" — avoided flaky tests on async random outcomes

4. **Iterative implementation**: Each commit was verified with `npm run lint && npm run test && npm run test:e2e` before proceeding. TypeScript build errors (e.g. `import type` for express Response, exported interfaces for return types) were caught and fixed in-loop.

Total interaction: ~15 prompts across planning and implementation, with the AI writing all source code, tests, and documentation.
