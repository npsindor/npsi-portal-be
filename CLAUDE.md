# CLAUDE.md

Backend API for the NPS Indore portal: NestJS 12 + TypeScript (strict, ESM) + MySQL (raw SQL via Sequelize). See `README.md` for setup and the API overview, `docs/migration-plan.md` for the endpoint inventory and old→new path mapping, and `docs/migration-report.md` for the NestJS migration results.

## Commands

- Install: `npm install`
- Dev: `npm run dev` (builds, then starts `dist/main.js` on `API_PORT`, default 4000)
- Build / start: `npm run build` / `npm start`
- Unit tests: `npm test`; with coverage (fails below 80%): `npm run test:cov`
- e2e tests: `npm run test:e2e` (real app in-process, throwaway DB `npsi_e2e_test`)
- Contract tests: `npm run test:contract` (black-box, every endpoint, throwaway DB `npsi_contract_test`); `npm run test:contract:legacy` runs them against the legacy Express app
- Lint/format (Biome): `npm run check` (lint + format check), `npm run lint`, `npm run format`; fix with `npx biome check --write`
- Migrations: `npm run db:migrate` (creates the DB if missing)
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
  database/               DatabaseService: execute/rows/first raw SQL + runPendingMigrations on boot
  common/                 filters/ (ApiError, HttpErrorFilter, ErrorVo/OkVo), guards/ (UserGuard, AdminGuard),
                          decorators/ (@CurrentUser), rate-limit/ (shared limiter instances), mail/, recaptcha/,
                          session/ (bearer-token lookup), utils/ (records, crypto)
  modules/<feature>/      <feature>.module.ts, .controller.ts, .service.ts, .repository.ts, .routes.ts,
                          dto/, vo/, <feature>.service.spec.ts
  testing/                fakes.ts (unit-test fakes), e2e-app.ts (e2e harness)
  e2e/                    *.e2e-spec.ts
tests/contract/           Contract suite (paths.mjs holds the legacy and v1 path tables)
server/                   Legacy Express app, kept only for comparison until production runs dist/main.js
```

Feature modules: `health`, `auth`, `me`, `lookups` (public lookups + duplicate-contact checks), `uploads`, `entities` (one generated controller per entity).

## Conventions

- **Thin controllers**: Swagger decorators, DTO in, call one service method, VO out. No business logic or SQL.
- **Services** hold business rules; **repositories** hold all SQL (parameterized; table/column names only from code and quoted with `quoteIdentifier`).
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

1. `src/modules/<feature>/`: `<feature>.routes.ts` (paths), `dto/` and `vo/` classes, `<feature>.repository.ts` (SQL via `DatabaseService`), `<feature>.service.ts` (rules, throws `ApiError`), `<feature>.controller.ts` (thin, fully Swagger-decorated, guards via `@UseGuards(UserGuard | AdminGuard)`), `<feature>.module.ts`.
2. Rate limits: in the module's `configure(consumer)`, apply an instance from `common/rate-limit/limiters.ts` to the routes from `*.routes.ts`.
3. Register the module in `app.module.ts`.
4. Tests: `<feature>.service.spec.ts` with fakes from `src/testing/fakes.ts`; e2e cases in `src/e2e/`; contract cases plus path entries in `tests/contract/`.
5. Run `npm run check`, `npm run build`, `npm run test:cov`, `npm run test:e2e`, `npm run test:contract`.

New entity table: add a migration, then add the entity to `modules/entities/entity-definitions.ts` (table, resource, columns) and to the access rules in `entity-rules.ts`; DTOs, VOs, controller and Swagger are generated from it. Add it to `ENTITY_RESOURCES` in the frontend.

## Database and environment

- The app runs pending migrations on boot (`DatabaseService.runPendingMigrations`), so deploys need no manual migrate step. A broken migration is logged but does not stop the server; check the startup log.
- Schema changes go in a new `db/migrations-sequelize/NNN-description.cjs` (CommonJS). Never edit a migration that has already run in production. `db/migrations/*.sql` are legacy PostgreSQL files and unused.
- MySQL can't index `TEXT` columns without a prefix length; use `{ name: "col", length: 255 }` in `addIndex`.
- Env vars (names unchanged from the legacy app): `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `API_PORT`, `FRONTEND_URL`, `UPLOADS_DIR`, `TRUST_PROXY`, `APP_ENV`, `RECAPTCHA_SECRET_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAILS`. Validated in `config/env.validation.ts`; defaults in `AppConfigService`.
- `src/config/load-env.ts` loads `.env.local` then `.env`; `scripts/*.mjs` and `config/database.cjs` read only `.env`.
- Passwords are scrypt hashes stored as `salt:hash` (`common/utils/crypto.ts`).

## Rules

- Never commit `.env*` files (except `.env.example`), CSV exports, `uploads/`, or anything under `database/`; they contain credentials or member PII.
- Keep behavior identical unless a change is intended: the contract tests are the source of truth for the API contract.
- Keep changes focused and match the existing code style (Biome-formatted, 160-column lines).
