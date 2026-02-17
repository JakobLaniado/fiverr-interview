# Project: Fiverr Interview — NestJS Backend

## Stack
- **Runtime**: Node.js
- **Framework**: NestJS (TypeScript, strict mode)
- **ORM**: TypeORM (with `autoLoadEntities: true`, `synchronize: true`)
- **Database**: PostgreSQL 16 (via Docker Compose)
- **Validation**: class-validator + class-transformer (global ValidationPipe with `whitelist` and `transform`)
- **Testing**: Jest (unit) + supertest (e2e)
- **Container**: Docker (multi-stage build) + Docker Compose

## Commands
| Action | Command |
|---|---|
| Start dev | `npm run start:dev` |
| Run unit tests | `npm run test` |
| Run e2e tests | `npm run test:e2e` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Start DB only | `docker compose up -d postgres` |
| Start full stack | `docker compose up -d` |
| Stop all | `docker compose down` |
| Build Docker image | `docker build -t fiverr-interview .` |

## Project Structure
```
src/
  common/
    config/          ← shared config (database.config.ts, etc.)
    guards/          ← auth guards, role guards
    interceptors/    ← logging, transform interceptors
    filters/         ← exception filters
    decorators/      ← custom decorators
    pipes/           ← custom pipes
  links/             ← Share & Earn short-links feature
    dto/             ← create-link.dto.ts, link-stats-query.dto.ts
    links.entity.ts
    clicks.entity.ts
    fraud-validation.util.ts
    links.service.ts
    links.controller.ts
    links.module.ts
    links.service.spec.ts
    links.controller.spec.ts
  <feature>/         ← one folder per domain feature
    dto/             ← create-*.dto.ts, update-*.dto.ts
    <feature>.entity.ts
    <feature>.service.ts
    <feature>.controller.ts
    <feature>.module.ts
    <feature>.service.spec.ts
    <feature>.controller.spec.ts
  app.module.ts      ← root module, only imports child modules
  app.controller.ts
  app.service.ts
  main.ts
test/
  *.e2e-spec.ts      ← e2e tests (supertest against real endpoints)
Dockerfile           ← multi-stage production build
.dockerignore
docker-compose.yml   ← postgres + backend services
.github/workflows/
  ci.yml             ← lint → test → e2e → build → docker build
```

## Project Structure Conventions
- Each domain feature gets its own NestJS module under `src/<feature>/`
- Module folder contains: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.entity.ts`, `<feature>.dto/` folder
- Import directly: `import { XModule } from './<feature>/<feature>.module'` (no barrel files)
- DTOs use `class-validator` decorators and live in a `dto/` sub-folder (e.g. `create-<feature>.dto.ts`, `update-<feature>.dto.ts`)
- Entities use TypeORM decorators (`@Entity`, `@Column`, `@PrimaryGeneratedColumn('uuid')`)
- Use constructor injection everywhere (no property injection)
- Services handle business logic; controllers are thin (only parse request → call service → return response)

## Coding Style
- Strict TypeScript — no `any`, no implicit returns, always explicit types on public methods
- Use `async/await` (never raw Promises)
- Prefer `const` over `let`; never use `var`
- Use named exports (no default exports)
- Follow NestJS naming conventions: PascalCase for classes, camelCase for methods/variables

## Database / TypeORM Guidelines
- Always use UUIDs (`@PrimaryGeneratedColumn('uuid')`) for primary keys
- Define relations explicitly with decorators (`@OneToMany`, `@ManyToOne`, etc.)
- Use Repository pattern via `@InjectRepository(Entity)`
- Config uses `registerAs()` in `src/common/config/` and is injected with the config token
- Import config directly: `import { databaseConfig } from './common/config/database.config'`
- Update DTOs should extend `PartialType(CreateXDto)` from `@nestjs/mapped-types`

## Testing Guidelines
- Unit tests: mock dependencies using `jest.fn()` / `{ provide: X, useValue: mockX }`
- E2e tests: use `@nestjs/testing` `Test.createTestingModule` with real database (supertest)
- Test files sit next to the source file (`*.spec.ts`) for unit tests
- E2e tests live in `test/` directory
- Every new endpoint must have at least unit tests for the controller and service
- After writing code, always run: `npm run lint && npm run test && npm run test:e2e`

## When Adding a New Feature
1. Create the module folder: `src/<feature>/`
2. Create entity → dto → service → controller → module (in that order)
3. Import the new module into `AppModule`
4. Write unit tests (`<feature>.service.spec.ts`, `<feature>.controller.spec.ts`)
5. Add e2e test in `test/<feature>.e2e-spec.ts`
6. Run `npm run lint && npm run test && npm run test:e2e`
7. **Update this CLAUDE.md** — add the new feature to the "Current Features" section

## Current Features
- **Health** (`GET /health`) — returns `{ status, db }` confirming DB connectivity
- **Root** (`GET /`) — returns "Hello World!"
- **Links** (Share & Earn short-links):
  - `POST /links` — create a short link (idempotent on targetUrl, 201)
  - `GET /:shortCode` — 302 redirect to target URL with async click tracking + fraud validation
  - `GET /stats` — paginated global analytics with monthly earnings breakdown

## Environment
- `.env` holds local config (not committed — see `.env.example`)
- Docker Compose (`docker-compose.yml`, project name: `fiverr`) manages PostgreSQL + backend
- For local dev: `docker compose up -d postgres` + `npm run start:dev`
- For full stack: `docker compose up -d` (builds & runs backend in Docker)
- Port defaults to `3000`

## Error Handling
- Use NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, etc.)
- Do not catch errors silently — let NestJS exception filters handle them
- For custom error responses, create exception filters in `src/common/filters/`

## API Conventions
- RESTful routes: plural nouns (`/users`, `/orders`)
- Use proper HTTP methods: GET (read), POST (create), PATCH (partial update), DELETE (remove)
- Return appropriate status codes (201 for create, 204 for delete, etc.)
- Use `ParseUUIDPipe` for UUID route params

---

# Skills — Claude AI Instructions

When the user says one of these commands, follow the instructions exactly.

## "update context" / "update claude.md"
Read the current state of the project (check `src/app.module.ts` for imported modules, scan `src/*/` for feature folders, check `package.json` for new dependencies). Then update this CLAUDE.md file:
1. Update the **Stack** section if new deps were added
2. Update the **Current Features** section with any new modules/endpoints
3. Update the **Project Structure** tree if the folder layout changed
4. Update **Commands** if new npm scripts were added
5. Do NOT remove existing content unless it's outdated

## "new feature <name>" / "add feature <name>"
Follow the "When Adding a New Feature" steps above exactly. Create all files, write tests, run verification, and update this CLAUDE.md when done.

## "verify" / "run checks"
Run the full verification pipeline:
```
npm run lint && npm run test && npm run test:e2e && npm run build
```
Report results clearly. If anything fails, fix it.

## "add entity <name>"
Create just the TypeORM entity file in the appropriate feature folder with UUID primary key, createdAt, and updatedAt columns as a starting point.

## "add dto <feature> <action>"
Create a DTO file with class-validator decorators in `src/<feature>/dto/<action>-<feature>.dto.ts`.

## Before Every Commit
Before creating any git commit, **always** run the "update context" skill first to ensure this CLAUDE.md reflects the current state of the project. Then commit the updated CLAUDE.md together with the rest of the changes.

## AI Prompts Used (Share & Earn Feature)
1. "Propose backend design + implementation plan for Share & Earn short-links" — full requirements
2. "Store cents in DB, atomic guard for double-reward, composite index, normalize targetUrl"
3. "Mock fraud validation in e2e, don't assert async random outcomes directly"
4. Implementation: 8 atomic commits, each verified with `lint + test + e2e`
