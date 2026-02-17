# Fiverr Share & Earn — Short Links Service

A backend service that lets Fiverr sellers generate short, trackable URLs pointing to their pages. Every valid click earns the seller $0.05 in Fiverr credits. Fraud validation runs asynchronously so redirects stay fast.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Start PostgreSQL
docker compose up -d postgres

# Start dev server
npm run start:dev
```

API runs at `http://localhost:3000`.

### Full Stack (Docker)

```bash
docker compose up -d
# Backend + Postgres at http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_NAME` | `interview` | Database name |
| `BASE_URL` | `http://localhost:3000` | Base URL for generated short links |
| `PORT` | `3000` | Server port |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Hello World |
| GET | `/health` | DB connectivity check |
| POST | `/links` | Create a short link |
| GET | `/:shortCode` | Redirect to target URL (302) |
| GET | `/stats` | Paginated global analytics |

### POST /links

Create a short link (idempotent on targetUrl).

**Request:**
```json
{ "targetUrl": "https://www.fiverr.com/some-gig" }
```

**Response (201):**
```json
{
  "shortUrl": "http://localhost:3000/aB3x9kLm",
  "shortCode": "aB3x9kLm",
  "targetUrl": "https://www.fiverr.com/some-gig"
}
```

**Errors:** `400` — invalid or missing URL

### GET /:shortCode

Redirect to the original URL. Tracks the click and triggers async fraud validation.

**Response:** `302 Found` with `Location` header.
**Errors:** `404` — unknown shortCode

### GET /stats

Paginated global analytics.

**Query params:** `page` (default 1, min 1), `limit` (default 10, min 1, max 100)

**Response (200):**
```json
{
  "data": [
    {
      "url": "https://www.fiverr.com/some-gig",
      "total_clicks": 150,
      "total_earning": 3.65,
      "monthly_breakdown": [
        { "month": "02/2026", "earning": 3.65 }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 10, "totalLinks": 1, "totalPages": 1 }
}
```

## Architecture

### Database Schema

```
links                              clicks
├── id (UUID PK)                   ├── id (UUID PK)
├── shortCode (VARCHAR UNIQUE)     ├── linkId (UUID FK → links)
├── targetUrl (TEXT UNIQUE)        ├── isValid (BOOLEAN NULL)
├── totalClicks (INT)              ├── rewarded (BOOLEAN)
├── validClicks (INT)              ├── rewardAmountCents (INT)
├── rewardAmountCents (INT)        └── clickedAt (TIMESTAMP)
├── createdAt (TIMESTAMP)
└── updatedAt (TIMESTAMP)

Indexes: links.shortCode (unique), links.targetUrl (unique),
         clicks(linkId, clickedAt) composite
```

All monetary values stored as **integer cents** (e.g. $0.05 = 5). Converted to dollars on API output.

### Key Design Decisions

1. **Idempotent link creation** — UNIQUE constraint on `targetUrl` + catch PostgreSQL error `23505`. Handles concurrent race conditions.

2. **Non-blocking redirect** — `GET /:shortCode` creates the click, increments the counter, and returns 302 immediately. Fraud validation runs async (fire-and-forget).

3. **Atomic double-reward guard** — `UPDATE clicks SET rewarded=true WHERE id=$1 AND rewarded=false RETURNING id`. Only increments link counters if a row is returned.

4. **Denormalized counters + query-time monthly stats** — Lifetime totals on `links` table for O(1) reads. Monthly breakdowns computed via `GROUP BY DATE_TRUNC('month', clickedAt)`.

## Project Structure

```
src/
  common/config/           — shared config (database, etc.)
  health/                  — health check module
  links/
    dto/                   — create-link, link-stats-query DTOs
    links.entity.ts        — Link entity (denormalized counters)
    clicks.entity.ts       — Click entity (per-click tracking)
    fraud-validation.util.ts — simulated async fraud check
    links.service.ts       — business logic
    links.controller.ts    — 3 endpoints
    links.module.ts        — module definition
    *.spec.ts              — unit tests
  app.module.ts            — root module
  main.ts                  — bootstrap
test/                      — e2e tests
```

## Scripts

```bash
npm run start:dev   # Dev server with hot reload
npm run test        # Unit tests (25 tests)
npm run test:e2e    # E2e tests (13 tests, requires Postgres)
npm run lint        # Lint + autofix
npm run build       # Production build
```

## Testing

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests (requires Postgres)
docker compose up -d postgres
npm run test:e2e

# Full verification pipeline
npm run lint && npm run test && npm run test:e2e && npm run build
```

### Test Coverage

| Area | Tests |
|---|---|
| Link creation | new link, idempotent duplicate, URL trimming |
| Redirect | 302 + Location header, 404 for unknown code |
| Click tracking | counter increment, async reward processing |
| Fraud guard | valid → reward, invalid → no reward, double-call → skip |
| Stats | pagination, monthly breakdown, empty state |
| Validation | invalid URL, missing fields, bad pagination params |

### Mocking Strategy

- **Unit tests**: repositories mocked via `jest.fn()`, fraud validation mocked via `jest.mock()`
- **E2E tests**: real database, fraud validation mocked to deterministic results for reliable assertions

## Docker

```bash
# Full stack (backend + postgres)
docker compose up -d

# Just the database
docker compose up -d postgres

# Build Docker image
docker build -t fiverr-interview .
```

## AI Environment Setup

This project uses **Claude Code** (Anthropic's CLI) as the AI development assistant. Configuration:

- **CLAUDE.md** — project instructions, conventions, and skills (e.g. `new feature`, `verify`, `update context`)
- **Strict TypeScript** — no `any`, explicit return types on public methods
- **Automated verification** — lint + test + e2e + build after every feature

Development was iterative: design → implement → test → fix → commit, with each commit representing an atomic, verified step.
