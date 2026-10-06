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
  configure-app.ts        HTTP setup shared by main.ts and e2e: helmet, request logging, CORS, 2 MB JSON, Express error handler,
                          /uploads static files, /api/v1 prefix, ValidationPipe, HttpErrorFilter, Swagger
  app.module.ts
  config/                 load-env.ts (.env.local then .env), env.validation.ts, AppConfigService
  database/               PrismaService (the client, migrations on boot, one-time adoption of the legacy database)
  generated/              Prisma client (generated, git-ignored)
  common/                 filters/ (ApiError, HttpErrorFilter, ErrorVo/OkVo), guards/ (UserGuard, AdminGuard, OptionalUserGuard),
                          decorators/ (@CurrentUser, @OptionalUser), dto/ (ListQueryDto: limit + order helpers),
                          validation/ (field decorators for DTOs), rate-limit/, logging/, mail/, recaptcha/, session/,
                          utils/ (crypto, dates, display-ids, json, markup, objects, text)
  <resource>/             One module per model, directly under src/ (announcements, applications, events, event-registrations,
                          families, family-members, feedback, notifications, principles, rules, samitis, samiti-members,
                          students, student-applications, transactions, transfer-requests):
                          <resource>.module.ts, .controller.ts, .service.ts, .repository.ts, dto/, vo/, .service.spec.ts
  auth/, me/, lookups/, uploads/, health/   Non-model features (same layout; lookups/ keeps lookups.routes.ts for its rate limits)
  membership/             Shared queries: a user's family, a family's members, what a user just submitted
  testing/                fakes.ts, fake-repo.ts (in-memory repository + membership/event fakes), rows.ts (typed row builders), e2e-app.ts
  e2e/                    *.e2e-spec.ts
prisma/                   schema.prisma (camelCase fields, @map/@@map to the existing snake_case columns/tables) and migrations/
tests/contract/           Contract suite (paths.mjs holds the endpoint table)
db/migrations-sequelize/  Frozen history of the original sequelize-cli migrations (already contained in 0_init; not run)
```

Every model has its own module (template: `src/notifications/` or any other model folder):
  - controller with the path written directly (`@Controller("families")`), guards per route, full Swagger docs;
  - DTOs that validate with the shared field decorators (`RequiredText("Title is required.")`, `OptionalText(255)`,
    `OptionalInt`, `OptionalNumber`, `OptionalBoolean`, `OptionalDate`, `OptionalJson`); list queries extend `ListQueryDto`
    with an `order` enum and the resource's own filters (`?familyId=&status=`), nothing generic;
  - VO in camelCase with real types: booleans, numbers for decimals, ISO date-times, `YYYY-MM-DD` for DATE columns, JSON values;
  - typed Prisma repository (`prisma.<model>.*`, Prisma types, no raw SQL);
  - service with the business rules (who may do what, member field whitelists, display ids, validation messages).

## Conventions

- **Thin controllers**: Swagger decorators, DTO in, call one service method, VO out. No business logic or SQL.
- **Services** hold business rules; **repositories** hold all data access through `PrismaService`, using the typed client. Raw SQL (tagged-template `$queryRaw` only, never the `Unsafe` variants) is limited to what Prisma can't express: the duplicate mobile/email checks in `lookups.repository.ts` (digits-only `REGEXP_REPLACE`) and the legacy-database adoption in `PrismaService`.
- Dates: request dates are ISO 8601; a date-time without a zone is UTC (`parseDate`). The database, the Prisma connection (`timezone: "+00:00"`) and production MySQL all run on UTC, so expiry checks compare against `new Date()`.
- Display ids (`NPSI-FAM-000123`, `NPSI-MEM-…`, `NPSI-STU-…`, `NPSI-APP-<year>-…`, `NPSI-STU-APP-<year>-…`, `FB-…`, `TRF-…`) come from `createWithDisplayId` (`common/utils/display-ids.ts`), which retries when two creates pick the same id.
- **DTOs** (`dto/`) for every body/query/param, camelCase. The global `ValidationPipe` (`whitelist`, `transform`, `forbidUnknownValues: false`, `stopAtFirstError`) strips unknown fields and reports one message per field; validators run in the order listed, so put the required check first. Ids are always generated by the server. `auth/` keeps its legacy-message validation in the service.
- **VOs** (`vo/`) for every response: `@ApiProperty` classes and a `to<Model>Vo(row)` mapper; never return raw DB rows.
- **Errors**: throw `ApiError(status, message)`; every error body is `{ "error": "<message>" }` (`HttpErrorFilter`, plus the Express error handler for CORS/JSON-parse errors).
- **Status codes**: POSTs that don't create anything use `@HttpCode(200)`; deletes and logout return 204.
- Every endpoint has `@ApiTags`, `@ApiOperation`, and `@ApiResponse` variants for success and each error case.
- No `any`. Biome's `useImportType` is off on purpose: injected classes must be value imports for Nest DI (decorator metadata).
- Relative imports use the `.js` extension (ESM/NodeNext).

## Endpoint naming and versioning

- Everything is under `/api/v1` (`API_PREFIX` in `configure-app.ts`); Swagger stays at `/api/docs`; uploaded files at `/uploads/<file>`.
- Plural, kebab-case resource nouns; no verbs (`POST /auth/sessions` to log in, `DELETE /auth/sessions/current` to log out, `PUT /auth/password`).
- At most one level of nesting (`/password-resets/confirmations`, `/<resource>/batch`, `/<resource>/:id`).
- Paths are written directly in the controller. Modules with rate limits keep them in `*.routes.ts`, shared with the middleware wiring in `configure(consumer)`.
- Changing a path, method or response shape is a breaking change for `npsi-portal-fe` (`src/api/endpoints.js`): update the frontend, `tests/contract/paths.mjs`, `docs/migration-plan.md`, and bump to `/api/v2` if old clients must keep working.

## Adding a module

1. `src/<feature>/` (next to `common/`, `config/`, `database/`): `dto/` and `vo/` classes, `<feature>.repository.ts` (Prisma via `PrismaService`), `<feature>.service.ts` (rules, throws `ApiError`), `<feature>.controller.ts` (thin, fully Swagger-decorated, guards via `@UseGuards(UserGuard | AdminGuard)`), `<feature>.module.ts`.
2. Rate limits: in the module's `configure(consumer)`, apply an instance from `common/rate-limit/limiters.ts`; keep those paths in `<feature>.routes.ts` so the controller and the middleware share them.
3. Register the module in `app.module.ts`.
4. Tests: `<feature>.service.spec.ts` with fakes from `src/testing/fakes.ts`; e2e cases in `src/e2e/`; contract cases plus path entries in `tests/contract/`.
5. Run `npm run check`, `npm run build`, `npm run test:cov`, `npm run test:e2e`, `npm run test:contract`.

New table: add the model to `prisma/schema.prisma` (camelCase fields with `@map`, `@@map` to the table), create a migration, then add a module for it as above and register it in `app.module.ts`; add its resource to `ENTITY_RESOURCES` in the frontend.

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

- Security already in place: session tokens are stored as SHA-256 (`common/session`), helmet security headers (uploads stay cross-origin embeddable), per-IP rate limits (`common/rate-limit/limiters.ts`: auth, OTP, public lookups, availability checks, uploads per 15 min and per day), Swagger disabled when `APP_ENV=production`. Non-admin creates are locked down: applications always start `PENDING_VERIFICATION` and transactions must belong to an application submitted in the last 15 minutes (once) or the member's own family/event, starting `PENDING` (`ApplicationsService`, `TransactionsService`); notifications go only to a just-submitted application (once), the member's own family or a just-requested transfer target, never as broadcasts or with links (`NotificationsService`).
- Logging: `common/logging/request-logger.ts` writes one JSON line per request through console (Hostinger's log viewer captures console output) and sets `X-Request-Id`; 5xx errors are logged with the same id. Never log query strings or bodies (PII). `LOG_REQUESTS=false` silences it (tests).
- Uploads: set `UPLOADS_DIR` on every deployed environment to a folder outside the app; each Hostinger deploy is a new code folder, so the default `./uploads` is wiped. Hostinger values: test `/home/u465324772/uploads-test`, production `/home/u465324772/uploads-prod` (separate so test files never mix with member files). The app warns at startup when it's missing on `APP_ENV=test|production`.
- Email: `MailService` retries transient failures (network, SMTP 4xx) twice; permanent 5xx rejections fail immediately.
- Never commit `.env*` files (except `.env.example`), CSV exports, `uploads/`, or anything under `database/`; they contain credentials or member PII.
- The contract tests are the source of truth for the API contract; change them together with any intended API change (and the frontend).
- Keep changes focused and match the existing code style (Biome-formatted, 160-column lines).
