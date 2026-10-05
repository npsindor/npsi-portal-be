# NestJS migration report

The backend was migrated from Express 5 + JavaScript (raw SQL through Sequelize) to NestJS 12 +
TypeScript (strict) with a Prisma 7 data layer, its endpoints moved to standardized `/api/v1`
paths, and the frontend updated to match. Business behavior is unchanged except for one approved
fix (logout without a token): the same black-box contract suite (85 tests) passes against the
legacy Express app on the old paths and against the NestJS + Prisma app on the new paths.

## Branches and commits (local, not pushed)

Backend `npsi-portal-be`, branch `feat/nestjs-migration` (from `test` at `d1c1e6a`):

| Commit | Phase |
|---|---|
| `docs: add NestJS migration plan with endpoint inventory and path mapping` | 0 – discovery (`docs/migration-plan.md`) |
| `test(contract): add black-box contract tests for every legacy endpoint` | 1 – safety net |
| `feat: migrate backend to NestJS + TypeScript` | 2 – migration (same paths) |
| `feat(api): move endpoints to standardized /api/v1 paths` | 3 – paths |
| `test: add service unit tests and e2e tests for every v1 endpoint` | 4 – tests |
| `docs: update CLAUDE.md and README, add migration report` | 6 – documentation |

Frontend `npsi-portal-fe`, branch `feat/api-path-migration` (from `test` at `19d45ee`):

| Commit | Phase |
|---|---|
| `feat(api): move API calls to the backend's /api/v1 paths` | 5 – frontend |
| `docs: document the v1 API map, lint and test commands` | 6 – documentation |

## Endpoint mapping

| Old | New |
|---|---|
| `GET /api/health` | `GET /api/v1/health` |
| `POST /api/auth/register` | `POST /api/v1/auth/registrations` |
| `POST /api/auth/verify-otp` | `POST /api/v1/auth/otp-verifications` |
| `POST /api/auth/resend-otp` | `POST /api/v1/auth/otps` |
| `POST /api/auth/login` | `POST /api/v1/auth/sessions` |
| `POST /api/auth/reset-request` | `POST /api/v1/auth/password-resets` |
| `POST /api/auth/reset-password` | `POST /api/v1/auth/password-resets/confirmations` |
| `POST /api/auth/invite` | `POST /api/v1/auth/invitations` |
| `POST /api/auth/change-password` | **`PUT`** `/api/v1/auth/password` |
| `GET /api/auth/me` | `GET /api/v1/auth/me` |
| `POST /api/auth/logout` | **`DELETE`** `/api/v1/auth/sessions/current` |
| `GET /api/me/family` | `GET /api/v1/me/family` |
| `GET /api/me/feedback` | `GET /api/v1/me/feedback` |
| `GET /api/verify/:familyId` | `GET /api/v1/family-verifications/:familyId` |
| `GET /api/track/application` | `GET /api/v1/application-status` |
| `GET /api/check-mobile` | `GET /api/v1/mobile-availability` |
| `GET /api/check-email` | `GET /api/v1/email-availability` |
| `GET /api/stats` | `GET /api/v1/stats` |
| `POST /api/upload` | `POST /api/v1/uploads` (files still served from `/uploads/<file>`) |
| `GET /api/entities/:entity` | `GET /api/v1/<resource>` |
| `POST /api/entities/:entity` | `POST /api/v1/<resource>` |
| `POST /api/entities/:entity/bulk` | `POST /api/v1/<resource>/batch` |
| `PATCH /api/entities/:entity/:id` | `PATCH /api/v1/<resource>/:id` |
| `DELETE /api/entities/:entity/:id` | `DELETE /api/v1/<resource>/:id` |

Resources: Announcement `announcements`, Application `applications`, Event `events`,
EventRegistration `event-registrations`, Family `families`, FamilyMember `family-members`,
Feedback `feedback`, Notification `notifications`, Principle `principles`, Rule `rules`,
Samiti `samitis`, SamitiMember `samiti-members`, Student `students`, StudentApplication
`student-applications`, Transaction `transactions`, TransferRequest `transfer-requests`.

Status codes and response bodies are unchanged for every endpoint (including 200 for login and
the other non-creating POSTs, 204 for logout and deletes, 200 `[]` for an empty batch).

## Prisma data layer

- **Prisma 7.10** with the MariaDB driver adapter (works with MySQL); no native query engine.
  Hostinger runs Node 22.18.0, the minimum Prisma 7 needs, so Prisma is pinned to `~7.10.0`.
- **Schema**: introspected from a database built by the legacy migrations
  (`prisma/schema.prisma`); models are named after the entities and `@@map` to the unchanged
  tables and columns. Verified identical: a Sequelize-built and a Prisma-built database both
  report "No difference detected" against the schema, and the seed data checksums match.
- **Migrations**: Prisma Migrate. `prisma/migrations/0_init` is the baseline (all 17 tables +
  the principles seed from legacy migration 002). Existing databases (test, production) are
  baselined automatically on first boot or `npm run db:migrate`: when `SequelizeMeta` has all 8
  legacy migrations and `_prisma_migrations` doesn't exist, `0_init` is marked applied without
  running it. Verified on a copy of the local dev database (`applied_steps_count 0`, no drift).
- **Response parity** (column codec): Prisma returns DATE as a full timestamp, DECIMAL as
  `"100"` and TINYINT booleans as `true`; responses keep the legacy `"2026-12-01"`, `"100.00"`
  and `1`/`0`. Writes and filters apply MySQL's old implicit conversions; unknown filter/order
  columns still return MySQL's `Unknown column ...` 500. New contract tests check each format
  against both apps.
- **Database clock kept**: session, OTP and reset-token expiry statements still use `NOW()` via
  Prisma's parameterized tagged-template SQL; sequential display ids keep their SQL too.
- `sequelize`/`sequelize-cli` are dev dependencies now, used only by the legacy `server/` app.

## Backend improvements (after the migration)

| # | Improvement | Where |
|---|---|---|
| 1 | Startup warning when `UPLOADS_DIR` is unset on test/production (each Hostinger deploy is a new code folder, so default uploads are wiped) | `configure-app.ts` |
| 3 | Session tokens stored as SHA-256 (a database copy can't be used to log in); **everyone logs in once after this deploys** | `auth.service.ts`, `session.service.ts` |
| 4 | helmet security headers (CSP, HSTS, nosniff, frame options; uploads stay cross-origin embeddable); no `X-Powered-By` | `configure-app.ts` |
| 5 | Public uploads: daily per-IP cap (150) on top of 40 per 15 min (login can't be required: registration uploads photos before an account exists) | `limiters.ts` |
| 6 | Email/mobile availability checks rate-limited (60 per 15 min per IP) against enumeration | `limiters.ts`, `lookups.module.ts` |
| 7 | Swagger disabled when `APP_ENV=production` (still on for test and local) | `configure-app.ts` |
| 8 | Dependency audit: 9 findings (5 high) → **0**; overrides for `mariadb` 3.5, `mysql2`, `deepmerge-ts` 8; `csv-parse` 7 | `package.json` |
| 9 | CI runs the e2e and contract suites against a MySQL 8.4 service before any deploy | `.github/workflows/deploy.yml` |
| 10 | Request logging: one JSON line per request through console (shows in Hostinger's log viewer), `X-Request-Id` header, 5xx logged with the id; no query strings logged | `common/logging/request-logger.ts` |
| 11 | Email retries for transient failures (network, SMTP 4xx), twice with backoff; permanent 5xx not retried | `mail.service.ts` |
| 12 | Graceful shutdown (`enableShutdownHooks`): DB connections closed on restart | `main.ts` |
| 13 | Duplicate email/mobile checks run in MySQL (EXISTS queries) instead of loading whole tables; same rules, proven against the legacy app by 3 new contract tests | `lookups.repository.ts` |
| 14 | Concurrent creates that compute the same display id (e.g. NPSI-APP-…) retry with the next free id instead of failing with a 500 | `entities.service.ts` |
| 15 | Indexes for member lookups by email (families, family_members, students, feedback) and family_members.membership_id | `prisma/migrations/20261005000000_add_member_lookup_indexes` |
| 16 | Legacy Express app, Sequelize, `config/database.cjs`, `.sequelizerc` and the legacy contract mode removed (after a final 88/88 comparison against the legacy app) | — |

Not done here: **#2** (`TRUST_PROXY` must be measured on the deployed test site), setting
`UPLOADS_DIR` in hPanel (a server change), and **#17** (DTO/Zod validation and domain modules:
a breaking redesign, to be planned separately).

## Test results (final run)

| Repo | Check | Result |
|---|---|---|
| Backend | `npm run check` (Biome lint + format, 70 files) | pass, 0 diagnostics |
| Backend | `npm run build` (tsc, strict) | pass |
| Backend | `npm test` (unit, 112 tests) | 112/112 pass |
| Backend | `npm run test:e2e` (31 tests, every v1 endpoint, real MySQL) | 31/31 pass |
| Backend | `npm run test:contract` (NestJS + Prisma, v1 paths) | 88/88 pass |
| Backend | Final comparison before removing the legacy app: same 88 contract tests on Express + Sequelize, old paths | 88/88 pass |
| Backend | `npm audit` | 0 vulnerabilities |
| Backend | Clean production-only install → build → start on a fresh DB | pass (Prisma client generated, `0_init` applied, 10 principles seeded) |
| Backend | Swagger at `/api/docs` | 99 operations, 71 schemas; every operation has a tag, summary, typed success response, at least one error response, and a request DTO wherever it takes a body |
| Frontend | `npm run lint` | 0 errors (44 pre-existing warnings, unchanged) |
| Frontend | `npm test` (6 tests) | 6/6 pass |
| Frontend | `npm run build` | pass |

## Service coverage (unit tests)

| File | Lines | Branches | Functions |
|---|---|---|---|
| auth.service.ts | 100% | 91.5% | 100% |
| entities.service.ts | 100% | 98.0% | 100% |
| lookups.service.ts | 100% | 100% | 100% |
| availability.service.ts | 100% | 97.3% | 100% |
| me.service.ts | 100% | 94.7% | 100% |
| health.service.ts | 100% | 83.3% | 100% |
| uploads.service.ts | 100% | 100% | 100% |
| session.service.ts | 100% | 100% | 100% |
| recaptcha.service.ts | 100% | 92.9% | 100% |
| mail.service.ts | 97.4% | 90.0% | 100% |
| app-config.service.ts | 96.8% | 100% | 92.3% |
| column-codec.ts | 100% | 92.5% | 100% |
| prisma.service.ts | 50.0% | 100% | 0% (needs a real DB; exercised by e2e and contract tests) |
| **All services + codec** | **95.2%** | **95.5%** | **92.9%** |

`npm run test:cov` enforces at least 80% lines, branches and functions.

## Deviations and decisions

### Behavior differences (all outside the normal request paths)
1. **Unknown body fields are dropped instead of failing.** The global `ValidationPipe` with
   `whitelist: true` (a stated requirement) strips fields that are not real columns. Before,
   an unknown field reached the SQL and failed with `500 Unknown column ...`; now it is ignored
   and the request succeeds. Every real column, its camelCase spelling (the legacy `toColumn`
   rule), `id` and `recaptchaToken` are still accepted, so no valid request changes.
2. **Unknown routes return JSON.** An unmatched path now returns `404 {"error":"Cannot GET /..."}`
   instead of Express's HTML 404 page. An unsupported entity used to be
   `404 {"error":"Unsupported entity: X"}`; with one route per resource it is now that generic
   404 (same status, same body shape).
3. **Old paths are gone.** `/api/...` (without `v1`) now returns 404, so the backend and
   frontend branches must be deployed together.

### Approved change
- **Logout without a bearer token now returns 204** (no-op). The legacy app returned a 500 with
  a raw driver message; with Prisma an empty token filter would have matched every user, so it
  is guarded explicitly.

### Minor differences from the Prisma data layer
- `/api/v1/health` when the database is down: still 503 `{ ok: false, error }`, but the error
  text now comes from the Prisma adapter instead of Sequelize.
- `updated_at` on entity updates is set from the app clock (UTC) instead of MySQL `NOW()`.
- Validation errors MySQL raised for impossible values (e.g. `"abc"` into an integer column)
  are still 500s with MySQL-style messages, but the exact wording may differ.

### Existing quirks kept on purpose (fixing them would change behavior; say if you want them fixed)
- A client-supplied `id` on create overrides the generated UUID wherever the non-admin field
  whitelist doesn't strip it (admins and the public-create entities).
- Datetime strings are normalized twice; the second pass reads them as server-local time. On a
  UTC server (Hostinger) there is no shift; on a machine in IST, stored times move by 5h30.

### Tooling decisions
- **Test runner: Node's built-in `node:test`, not Jest.** Nest 12 ships as ESM only and Jest's
  ESM support is experimental and fragile with decorator metadata. Specs are compiled with `tsc`
  and run with Node's runner, which also provides coverage. Supertest is used for e2e/contract.
- **Biome** replaces linting/formatting (the backend had no ESLint/Prettier). `useImportType` is
  disabled because Nest DI needs value imports of injected classes. The frontend keeps its
  existing ESLint setup (the goal's Biome requirement was for the backend).
- **TypeScript 5.9**, not 7: TypeScript 7 is too new for the surrounding tooling.
- DTO fields are optional at the DTO level so that services keep returning the exact legacy
  validation messages and status codes; the DTOs document and whitelist the inputs.

### Frontend notes
- All URLs are centralized in `src/api/endpoints.js`; `base44Client.js` (the live client) and
  `appClient.js` (unused) both use it. No UI or logic changes.
- One unused import (`QrCode` in `MemberDashboard.jsx`) was removed because it was the only lint
  error. The 44 lint warnings were already there and are unchanged.
- The frontend had no tests; `npm test` now checks the URL map against the backend mapping and
  fails if a hard-coded `/api/` path appears outside `endpoints.js`.

## Follow-ups before deploying (not done; they change production)
1. **Deploy both branches together.** The frontend must call `/api/v1`, which only the new
   backend serves.
2. **Deploy pipeline** (done on this branch): the check job runs Biome, build, unit, e2e and contract tests (MySQL 8.4 service);
   Hostinger builds with `npm run build` (which runs `prisma generate`) and starts
   `dist/main.js`; the health check calls `/api/v1/health`. Verify on the test environment first.
3. **First boot on test/production** baselines the existing database automatically (see
   "Prisma data layer"). Take a database backup before the first production deploy.
4. **Set `UPLOADS_DIR`** on the test and production backends in hPanel to a folder outside
   the deployed code (e.g. `/home/u465324772/uploads`), then restart.
5. **Measure `TRUST_PROXY`** on the test site after deploying (RateLimit headers with and
   without a forged `X-Forwarded-For`) and set it in hPanel.
6. **Everyone logs in once** after this deploys (session tokens are now stored hashed).
