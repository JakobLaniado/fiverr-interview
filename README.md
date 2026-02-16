# Fiverr Interview — NestJS Backend

NestJS REST API with TypeScript, TypeORM, and PostgreSQL.

## Prerequisites

- Node.js 20+
- Docker

## Quick Start

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d postgres

# Copy env file
cp .env.example .env

# Start dev server
npm run start:dev
```

API runs at `http://localhost:3000`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Hello World |
| GET | `/health` | DB connectivity check |

## Scripts

```bash
npm run start:dev   # Dev server with hot reload
npm run test        # Unit tests
npm run test:e2e    # E2e tests (requires DB)
npm run lint        # Lint + autofix
npm run build       # Production build
```

## Docker

```bash
# Full stack (backend + postgres)
docker compose up -d

# Just the database
docker compose up -d postgres
```

## Project Structure

```
src/
  common/config/    — shared config (database, etc.)
  health/           — health check module
  app.module.ts     — root module
  main.ts           — bootstrap
test/               — e2e tests
```
