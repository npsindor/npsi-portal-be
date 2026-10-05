# CLAUDE.md

Backend API for the NPS Indore portal: NestJS 12 + TypeScript (strict, ESM) + MySQL through Prisma 7 (MariaDB driver adapter). See `README.md` for setup and the API overview, `docs/migration-plan.md` for the endpoint inventory and old→new path mapping, and `docs/migration-report.md` for the NestJS migration results.

## Commands

- Install: `npm install` (also runs `prisma generate` into the git-ignored `src/generated/`)
- Dev: `npm run start:dev` (or `npm run dev`): `nest start --watch`, rebuilds and restarts on changes, on `API_PORT` (default 4000); `npm run start:debug` adds the inspector
- Build: `npm run build` (`prisma generate` + `nest build` → `dist/`, config in `nest-cli.json`)
- Start: `npm start` (`nest start`, builds first) or `npm run start:prod` (`node dist/main.js`, what Hostinger runs)
- Unit tests: `npm test`; with coverage (fails below 80%): `npm run test:cov`
- e2e tests: `npm run test:e2e` (real app in-process, throwaway DB `npsi_e2e_test`)
- Contract tests: `npm run test:contract` (builds, then black-box tests every endpoint of `dist/main.js` on throwaway DB `npsi_contract_test`)
- Lint/format (Biome): `npm run check` (lint + format check), `npm run lint`, `npm run format`; fix with `npx biome check --write`
- Migrations: `npm run db:migrate` (creates the DB if missing, baselines a legacy database, runs `prisma migrate deploy`). New migration: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` against a local database.
- Health check: `curl http://localhost:4000/api/v1/health` (reports `env` from `APP_ENV`)
- Swagger: `http://localhost:4000/api/docs` (JSON: `/api/docs-json`)

Tests run on Node's built-in test runner (`node:test`), not Jest: Nest 12 ships as ESM only. Specs are compiled by `tsc -p tsconfig.json` into `.test-build/` and run from there. The e2e and contract suites need local MySQL (credentials from `.env`); they create and drop their own databases and disable SMTP/reCAPTCHA.

## Structure

```
src/
  main.ts                 Bootstrap (imports config/load-env.js first)
  configure-app.ts        HTTP setup shared by main.ts and e2e: trust proxy, CORS, 2 MB JSON, Express error handler,
                          /uploads static files, /api/v1 prefix, ValidationPipe, HttpErrorFilter, Swagger
  app.module.ts
  config/                 load-env.ts (.env.local then .env), env.validation.ts, AppConfigService (typed, legacy defaults)
  database/               PrismaService (client + migrations on boot, with the legacy baseline), column-codec.ts
                          (Prisma ⇄ legacy MySQL value formats), database.types.ts
  generated/              Prisma client (generated, git-ignored)
  common/                 filters/ (ApiError, HttpErrorFilter, ErrorVo/OkVo), guards/ (UserGuard, AdminGuard),
                          decorators/ (@CurrentUser), rate-limit/ (shared limiter instances), mail/, recaptcha/,
                          session/ (bearer-token lookup), utils/ (records, crypto)
  <feature>/              One folder per feature directly under src/ (auth, entities, health, lookups, me, uploads):
                          <feature>.module.ts, .controller.ts, .service.ts, .repository.ts, .routes.ts,
                          dto/, vo/, <feature>.service.spec.ts
  testing/                fakes.ts (unit-test fakes), e2e-app.ts (e2e harness)
  e2e/                    *.e2e-spec.ts
prisma/                   schema.prisma (models named after entities, @@map to the existing tables) and migrations/ (0_init = baseline)
tests/contract/           Contract suite (paths.mjs holds the endpoint table)
db/migrations-sequelize/  Frozen history of the original sequelize-cli migrations (already contained in 0_init; not run)
```

Feature modules: `health`, `auth`, `me`, `lookups` (public lookups + duplicate-contact checks), `uploads`, `entities` (one generated controller per entity).

## Conventions

- **Thin controllers**: Swagger decorators, DTO in, call one service method, VO out. No business logic or SQL.
- **Services** hold business rules; **repositories** hold all data access through `PrismaService`. Use the typed client; tagged-template `$queryRaw`/`$executeRaw` only where SQL must stay as it was (expiry checks against the database clock `NOW()`, sequential display ids). Never use the `Unsafe` raw variants in app code.
- Repository results for entity tables go through `toApiRow` (column codec): Prisma returns `true`/`false`, `Decimal` and `Date` for DATE columns, but the API has always returned `1`/`0`, `"100.00"` and `"YYYY-MM-DD"`. Writes go through `toDbValue`, which applies MySQL's old implicit conversions.
- **DTOs** (`dto/`) for every body/query/param: class-validator + `@ApiProperty`. The global `ValidationPipe` (`whitelist`, `transform`, `forbidUnknownValues: false`) strips unknown fields. DTO fields are deliberately `@IsOptional()`: services validate with the exact user-facing messages and status codes, so don't move that validation into DTO decorators without updating the contract tests.
- **VOs** (`vo/`) for every response: `@ApiProperty` classes; never return raw DB rows. Entity rows go out through `toEntityVo` (renames `created_at`/`updated_at` to `created_date`/`updated_date`, parses JSON strings).
- **Errors**: throw `ApiError(status, message)`; every error body is `{ "error": "<message>" }` (`HttpErrorFilter`, plus the Express error handler for CORS/JSON-parse errors).
- **Status codes**: POSTs that don't create anything use `@HttpCode(200)`; deletes and logout return 204.
- Every endpoint has `@ApiTags`, `@ApiOperation`, and `@ApiResponse` variants for success and each error case.
- No `any`. Biome's `useImportType` is off on purpose: injected classes must be value imports for Nest DI (decorator metadata).
- Relative imports use the `.js` extension (ESM/NodeNext).

## Endpoint naming and versioning

- Everything is under `/api/v1` (`API_PREFIX` in `configure-app.ts`); Swagger stays at `/api/docs`; uploaded files at `/uploads/<file>`.
- Plural, kebab-case resource nouns; no verbs (`POST /auth/sessions` to log in, `DELETE /auth/sessions/current` to log out, `PUT /auth/password`).
- At most one level of nesting (`/password-resets/confirmations`, `/<resource>/batch`, `/<resource>/:id`).
- Route strings live in each module's `*.routes.ts` and are reused by the rate-limit middleware wiring; change them there.
- Changing a path, method or response shape is a breaking change for `npsi-portal-fe` (`src/api/endpoints.js`): update the frontend, `tests/contract/paths.mjs`, `docs/migration-plan.md`, and bump to `/api/v2` if old clients must keep working.

## Adding a module

1. `src/<feature>/` (next to `common/`, `config/`, `database/`): `<feature>.routes.ts` (paths), `dto/` and `vo/` classes, `<feature>.repository.ts` (Prisma via `PrismaService`), `<feature>.service.ts` (rules, throws `ApiError`), `<feature>.controller.ts` (thin, fully Swagger-decorated, guards via `@UseGuards(UserGuard | AdminGuard)`), `<feature>.module.ts`.
2. Rate limits: in the module's `configure(consumer)`, apply an instance from `common/rate-limit/limiters.ts` to the routes from `*.routes.ts`.
3. Register the module in `app.module.ts`.
4. Tests: `<feature>.service.spec.ts` with fakes from `src/testing/fakes.ts`; e2e cases in `src/e2e/`; contract cases plus path entries in `tests/contract/`.
5. Run `npm run check`, `npm run build`, `npm run test:cov`, `npm run test:e2e`, `npm run test:contract`.

New entity table: add the model to `prisma/schema.prisma` (`@@map` to the table) and create a migration, then add the entity to `entities/entity-definitions.ts` (table, resource, columns with their kinds; the column codec uses them) and to the access rules in `entity-rules.ts`; DTOs, VOs, controller and Swagger are generated from it. Add it to `ENTITY_RESOURCES` in the frontend.

## Database and environment

- The app applies pending Prisma migrations on boot (`PrismaService.runPendingMigrations` → `prisma migrate deploy`), so deploys need no manual migrate step. A broken migration is logged but does not stop the server; check the startup log.
- Legacy baseline: a database built by the old sequelize-cli migrations (has `SequelizeMeta` with all 8, no `_prisma_migrations`) gets `0_init` marked applied without running it, on first boot or `npm run db:migrate`. Fresh databases run `0_init`, which also seeds the principles.
- Schema changes: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` locally, commit the new `prisma/migrations/<timestamp>_<change>/` folder. Never edit a migration that has run in production. `db/migrations-sequelize/` is frozen history (already contained in `0_init`); `db/migrations/*.sql` are legacy PostgreSQL files and unused.
- MySQL can't index `TEXT` columns without a prefix length; in Prisma use `@@index([col(length: 255)])`.
- Env vars (names unchanged from the legacy app): `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `API_PORT`, `FRONTEND_URL`, `UPLOADS_DIR`, `TRUST_PROXY`, `APP_ENV`, `RECAPTCHA_SECRET_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAILS`. Validated in `config/env.validation.ts`; defaults in `AppConfigService`.
- `src/config/load-env.ts`, `prisma.config.ts` and `scripts/migrate.mjs` load `.env.local` then `.env` (the process environment wins); the Prisma connection URL is built from the `MYSQL_*` variables (or `DATABASE_URL` if set). The import scripts read only `.env`.
- Hostinger runs Node 22.18.0, the minimum for Prisma 7; keep Prisma on 7.x unless the Node version there goes up.
- Passwords are scrypt hashes stored as `salt:hash` (`common/utils/crypto.ts`).

## Rules

- Security already in place: session tokens are stored as SHA-256 (`common/session`), helmet security headers (uploads stay cross-origin embeddable), per-IP rate limits (`common/rate-limit/limiters.ts`: auth, OTP, public lookups, availability checks, uploads per 15 min and per day), Swagger disabled when `APP_ENV=production`.
- Logging: `common/logging/request-logger.ts` writes one JSON line per request through console (Hostinger's log viewer captures console output) and sets `X-Request-Id`; 5xx errors are logged with the same id. Never log query strings or bodies (PII). `LOG_REQUESTS=false` silences it (tests).
- Uploads: set `UPLOADS_DIR` on every deployed environment to a folder outside the app; each Hostinger deploy is a new code folder, so the default `./uploads` is wiped. The app warns at startup when it's missing on `APP_ENV=test|production`.
- Email: `MailService` retries transient failures (network, SMTP 4xx) twice; permanent 5xx rejections fail immediately.
- Never commit `.env*` files (except `.env.example`), CSV exports, `uploads/`, or anything under `database/`; they contain credentials or member PII.
- Keep behavior identical unless a change is intended: the contract tests are the source of truth for the API contract.
- Keep changes focused and match the existing code style (Biome-formatted, 160-column lines).
