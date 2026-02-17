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

Built with **Claude Code** (Anthropic CLI, Claude Opus 4.6 model) in VSCode extension.

### Tool Setup

- **CLAUDE.md**: Project-level instruction file defining stack, conventions, coding style, testing guidelines, and skills (e.g. `new feature`, `verify`, `update context`). Claude reads this automatically on every conversation.
- **Plan Mode**: Used Claude Code's plan mode to design the architecture before writing any code. The plan went through 5 review cycles with human feedback before approval.
- **Commit workflow**: Each implementation step = 1 atomic commit, verified with `npm run lint && npm run test && npm run test:e2e` before committing.

### Conversation Prompts (Chronological)

**Prompt 1 — Initial Design Request:**
> "You are my coding copilot for an interview task. I need you to propose a backend design + an implementation plan for a 'Fiverr Share & Earn' short-links service.
> Goal: Create shareable short, clean, trackable URLs that redirect to seller-owned Fiverr pages. Sellers earn $0.05 credits per valid click.
> Core loop: 1) Generate short link 2) Share it 3) Redirect + award $0.05 if fraud validation passes.
> Functional requirements: POST /links, GET /:shortCode (302 redirect, async fraud check), GET /stats (paginated with monthly breakdown)."

*Result: Claude explored the codebase with 2 parallel agents, then designed the full architecture (DB schema, service methods, controller routes, test strategy).*

**Prompt 2 — Stats Response Format Correction:**
> "Notice that on /stats I need to get this back: [{ url, total_clicks, total_earning, monthly_breakdown: [{ month: '12/2025', earning: 1.00 }] }]"

*Result: Simplified stats response — removed shortCode/shortUrl from stats, monthly_breakdown only contains month + earning.*

**Prompt 3 — Money Storage + Double-Reward Guard:**
> "Fix 2 critical correctness issues:
> 1) Store cents in DB as INT, convert to float on API output.
> 2) Double reward prevention must use atomic guard: UPDATE clicks SET rewarded=true WHERE id=$1 AND rewarded=false RETURNING id. Only increment link counters if row returned."

*Result: Switched from DECIMAL to INT for all money columns. Added `rewarded` boolean column to clicks table. Implemented atomic UPDATE...RETURNING guard in processClickReward.*

**Prompt 4 — Minor Improvements:**
> "Add composite index clicks(linkId, clickedAt). Normalize targetUrl (trim) before insert. Fire-and-forget reward is best-effort; production uses a queue."

*Result: Added composite index for stats performance, .trim() on targetUrl, documented trade-off in MANIFEST.*

**Prompt 5 — E2E Testing Strategy:**
> "In e2e, don't assert reward/earnings directly because fraud is async + random. Mock fraud validation to deterministic OR only assert total_clicks."

*Result: E2e tests mock fraud-validation.util via jest.mock() for deterministic assertions. Both total_clicks and total_earning are tested reliably.*

**Prompt 6 — Commit Structure:**
> "Organize with a commit at each critical step. Senior level code."

*Result: Plan restructured into 8 atomic commits, each with scope, verification step, and conventional commit message.*

### Implementation Flow

| Commit | Prompt/Action | What Changed |
|---|---|---|
| 1 | Claude implements plan step 1 | Link + Click entities, module, AppModule registration |
| 2 | Claude implements plan step 2 | DTOs with class-validator, fraud validation utility |
| 3 | Claude implements plan step 3 | LinksService — 5 methods with idempotency, atomic guard, batch stats |
| 4 | Claude implements plan step 4 | LinksController — 3 routes, correct ordering (stats before :shortCode) |
| 5 | Claude implements plan step 5 | 14 unit tests (service + controller), fraud validation mocked |
| 6 | Claude implements plan step 6 | 11 e2e tests with deterministic fraud mock, real DB |
| 7 | Human requests docs | README + MANIFEST documentation |
| 8 | Claude updates config | CLAUDE.md features, .env.example with BASE_URL |

### Bugs Caught During Implementation

1. **TypeScript `import type` error** — Express `Response` type needed `import type` with `isolatedModules` + `emitDecoratorMetadata` enabled. Fixed by splitting into `import type { Response }`.
2. **Unexported interface** — `StatsResponse` was private in the service but referenced by the controller's return type. Fixed by exporting the interface.
3. **TypeORM `delete({})` error** — Empty criteria not allowed in TypeORM delete. E2e cleanup switched to raw `DELETE FROM` queries.
4. **Test data leakage** — `afterEach` cleanup was failing (due to bug #3), causing data to leak between e2e tests. Fixed alongside bug #3.

### Key Decisions Made by Human vs AI

| Decision | Who | Rationale |
|---|---|---|
| Overall architecture (2 tables, denormalized counters) | AI proposed, human approved | Standard pattern for read-heavy analytics |
| Integer cents for money | Human requested | Avoids floating-point precision bugs |
| Atomic double-reward guard | Human requested | Prevents financial bugs under concurrency |
| Fire-and-forget vs queue | AI proposed, human approved | Acceptable for demo; documented as trade-off |
| Stats response shape | Human specified | `{ url, total_clicks, total_earning, monthly_breakdown }` |
| Mock fraud in e2e | Human requested | Prevents flaky tests |
| 8 atomic commits | Human requested | Senior-level git history |
