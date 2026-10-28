# nps-be

Backend API for the NPS Indore (Patidar Samaj) portal: NestJS + TypeScript (strict) backed by MySQL through Prisma 7. It replaced the Base44 hosted backend; the frontend's `base44.entities.*` client maps onto one REST resource per model.

The frontend lives in a separate repo and talks to this API through `VITE_API_BASE_URL` (default `http://localhost:4000`). Interactive API docs: **`/api/docs`** (Swagger UI), JSON at `/api/docs-json`.

## Requirements

- Node.js 22+
- MySQL 8.x

## Setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then fill in MYSQL_PASSWORD (and SMTP_* if needed)
npm run db:migrate          # creates the database if missing and applies Prisma migrations
                            # (run again after pulling new migrations; watch mode skips automatic migrations)
npm run start:dev           # nest start --watch: the API on http://localhost:4000, reloads on changes
```

Check it's up:

```bash
curl http://localhost:4000/api/v1/health
```

### Environment files

The API server loads `.env.local` first, then `.env` (values in `.env.local` win; variables already set in the process environment win over both). The scripts in `scripts/` only read `.env`, so keep database settings in `.env`. See `.env.example` for all variables. Never commit `.env` files.

The API pool allows three connections per process and keeps one idle connection ready for reuse. Development and debug watch commands set `SKIP_DB_MIGRATIONS=true` to avoid migration connections on every restart. Normal startup still applies migrations automatically; set the same variable to skip them when migrations are handled separately.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` (alias `npm run dev`) | `nest start --watch`: run the API and reload on changes |
| `npm run start:debug` | Same, with the Node inspector |
| `npm run build` | Generate the Prisma client and `nest build` to `dist/` |
| `npm start` / `npm run start:prod` | `nest start` / run the compiled `dist/main.js` (production) |
| `npm test` | Unit tests (services, no database) |
| `npm run test:cov` | Unit tests with coverage; fails below 80% |
| `npm run test:e2e` | e2e tests: every endpoint through the real app on a throwaway MySQL database |
| `npm run test:contract` | Contract tests (black-box, every endpoint) against the built app |
| `npm run check` / `lint` / `format` | Biome: check (lint + format), lint only, format files |
| `npm run db:migrate` | Create the database if needed, baseline a legacy (sequelize-built) database, and run `prisma migrate deploy` |
| `npx prisma migrate dev --name <change>` | Create a new migration from changes to `prisma/schema.prisma` (local database) |
| `npm run db:import` | One-time seed: import Base44 CSV exports from `./database/<Entity>_export.csv` |
| `npm run db:import-users -- <path/to/users.csv>` | Import a Base44 user export |
| `LOCAL_USER_PASSWORD=... node scripts/set-user-password.mjs <email>` | Set a user's password (user exports have no password hashes) |

The e2e and contract tests create and drop their own databases (`npsi_e2e_test`, `npsi_contract_test`) using the MySQL credentials from `.env`; they never touch the configured database, and they disable SMTP and reCAPTCHA.

## Project layout

```
src/
  main.ts, app.module.ts, configure-app.ts   Bootstrap and HTTP setup (CORS, JSON limit, prefix, pipes, filter, Swagger)
  config/       Env loading (.env.local, .env), validated env schema, typed AppConfigService
  database/     PrismaService (client + boot-time migrations)
  generated/    Prisma client (generated, git-ignored)
  common/       Error filter and { error } body, auth guards, rate limiters, mail, reCAPTCHA, sessions, helpers
  <resource>/   One module per model (announcements … transfer-requests), plus auth/, health/, lookups/, me/, uploads/, membership/
  testing/      Unit-test fakes and the e2e harness
  e2e/          e2e tests
tests/contract/ Black-box contract tests (every endpoint)
prisma/         schema.prisma and migrations/ (0_init is the baseline of the legacy schema)
prisma.config.ts Prisma CLI config (connection built from MYSQL_* env vars)
db/migrations-sequelize/  Frozen history of the original migrations (contained in Prisma's 0_init; not run)
db/migrations/  Legacy PostgreSQL SQL migrations, kept for reference only
scripts/        Migrate, import and password utilities
docs/           Migration plan and report
```

## API overview

All routes are under `/api/v1` (full details in Swagger at `/api/docs`):

- `GET /health`
- Auth: `POST /auth/registrations`, `POST /auth/otp-verifications`, `POST /auth/otps`, `POST /auth/sessions` (login), `DELETE /auth/sessions/current` (logout), `POST /auth/password-resets`, `POST /auth/password-resets/confirmations`, `PUT /auth/password`, `POST /auth/invitations` (admin), `GET /auth/me`
- Current user: `GET /me/family`, `GET /me/feedback`, `GET /me/event-registrations`
- Public lookups: `GET /family-verifications/:familyId`, `GET /application-status?applicationId=&mobile=`, `GET /mobile-availability?mobile=`, `GET /email-availability?email=`, `GET /stats`
- Uploads: `POST /uploads` (multipart, field `file`); files are served from `/uploads/<name>` (outside `/api/v1`)
- Entities, one resource each (`announcements`, `applications`, `events`, `event-registrations`, `families`, `family-members`, `feedback`, `notifications`, `principles`, `rules`, `samitis`, `samiti-members`, `students`, `student-applications`, `transactions`, `transfer-requests`): `GET|POST /<resource>`, `PATCH|DELETE /<resource>/:id` (plus `POST /family-members/batch` and `POST /notifications/batch`). Fields are camelCase; lists take `?order=<field>|-<field>&limit=1..500` and the resource's own filters (`/families?familyId=&status=`, `/family-members?familyId=`, `/samiti-members?samitiId=`)

Errors are always `{ "error": "<message>" }`. Auth uses a bearer token (`Authorization: Bearer <token>`) returned by login or OTP verification. Admin-only actions require `users.role = 'admin'`.

## Uploads, rate limiting and reCAPTCHA

- Uploaded files are stored in `UPLOADS_DIR` (default `./uploads`, git-ignored). **On Hostinger, set `UPLOADS_DIR` to a folder outside the app**: every deploy creates a new code folder, so the default is wiped. One folder per site: test uses `/home/u465324772/uploads-test`, production `/home/u465324772/uploads-prod` (the app creates it on startup). Back this folder up; it is not in the database.
- Auth, OTP, public lookup, availability-check and upload endpoints are rate-limited per IP (`express-rate-limit`); uploads also have a daily cap.
- Security headers via helmet; session tokens are stored hashed; Swagger is off when `APP_ENV=production`.
- Every response has an `X-Request-Id`; each request is logged as one JSON line (no query strings), and 5xx errors are logged with the same id.
- Registration and application forms are protected by Google reCAPTCHA v3 when `RECAPTCHA_SECRET_KEY` is set; leave it unset locally to skip verification.

## Making a user admin

Register through the frontend, then:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## Password reset emails

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, then restart the server. If SMTP is not configured, the API logs a warning and skips sending; the reset token is never returned in the API response, so without SMTP read it from the database to test the flow locally.

Note: if your local `.env` points at a real mailbox, emails sent while testing locally are delivered for real.

### Production migration assets

Build releases with `npm run build` and deploy the **entire `dist/` directory**, including `dist/prisma/schema.prisma`, `dist/prisma/migrations/`, and `dist/prisma.config.mjs`. The build copies the complete migration history automatically; future migrations do not require deployment configuration changes. Keep production dependencies installed, including the Prisma CLI.

Startup passes the bundled Prisma config by absolute path, so schema discovery does not depend on the hosting process's working directory. Startup migrations and `npm run db:migrate` use the same `MYSQL_*` connection settings as the API, overriding any stale `DATABASE_URL` for their Prisma subprocess. Special characters in credentials are URL-encoded. `SKIP_DB_MIGRATIONS=true` disables startup migration deployment; leave it unset or false when startup should apply migrations. The API waits for its database connection and migrations before accepting requests. A connection or migration failure stops startup; it no longer serves requests against an outdated schema. If assets are missing, the startup log explains which build/deployment step is required.

For hosts using a custom build command, use `npm run build` instead of only `nest build`. The production start command remains `npm run start:prod`. Redeploy a newly built artifact to fix an existing release missing its migration assets.

### Safar Saathi

`/transportation` now uses the authenticated `/api/v1/safar-saathi` API, not browser demo storage. Apply migrations and rebuild/restart the API when deploying this feature.

- Public `GET /safar-saathi/capabilities` exposes available notification channels.
- Approved, active members can `GET /safar-saathi/me`, `POST /safar-saathi/entries`, cancel their own entries with `PATCH /safar-saathi/entries/:id/cancellation`, and accept/decline/complete their own matches with `PATCH /safar-saathi/matches/:id`.
- Entries require a registered account/membership mobile, a future-or-today date, a valid time, and consent. Requests for delivery also require item details. Client UUIDs make retries idempotent.
- Matching uses normalized origin, destination, date, and assistance type. Common Hindi/English city aliases are supported; this is exact route/date coordination, not geospatial routing. Self-matches are excluded. Contact details stay private until both parties accept.
- Private notices persist in `safar_notices`. Email is sent only when selected and SMTP is configured; failures remain visible in the private inbox. SMS is not configured and cannot be selected. No notification contains another member’s contact details.
- The additive migration accommodates the existing `users.id` collation without changing member tables. `node scripts/deploy-safar-migration.mjs --apply` refuses unrelated pending migrations.
- `node scripts/verify-safar-transaction.mjs` checks the real service inside a transaction that always rolls back, with no email/SMS sent. Build first. Unit coverage lives in `src/safar-saathi/safar.service.spec.ts`; frontend browser coverage is in `tests/browser/safar-saathi.spec.js`.

### Sehat Saathi

Public health resources and the consented verified MR directory are at `/medical`; administration is at `/admin/sehat-saathi`. The page uses Bootstrap 5.3.8 scoped to `.sehat-module`, so existing portal pages retain their styling. Hindi is the default for a first visit to this module; saved language choices take precedence.

The `/api/v1/sehat-saathi` endpoints persist MR applications, medicine-access enquiries, area routing, complaints, notification logs and audit records. Only active approved members can submit. MR verification is a separate administrator decision; editing a profile returns it to pending and withdraws/reassigns active work. Only approved MRs with publication consent appear publicly. Unassigned MRs see only a request's reference, city, area and assistance type. Medicine and member contact details become visible only to the assigned MR after acceptance. Acceptance is claimed atomically; another MR cannot claim the same request.

Admin management covers profile verification, resource CRUD, request CRUD/assignment/status, report CRUD and notification retry/deletion. Audit history is deliberately append-only and exportable: actor, action, entity and timestamp are recorded without copying health/contact details into the audit log. No prescriptions or medical-report uploads, diagnosis, prescription generation, sales or informal medicine transfers are supported. Sample enquiries are limited to lawful authorized-channel assistance, without availability promises.

Deployment:

1. Build the API with `npm run build`.
2. Apply the additive migration with `node scripts/deploy-sehat-migration.mjs --apply`. This refuses unrelated pending migrations and accommodates the existing user-ID collation.
3. Optionally add the four researched official resource links with `node scripts/seed-sehat-resources.mjs`. Existing URLs are not overwritten. No doctor, hospital or MR profile is invented.
4. Restart the backend. Notification outbox work runs every 30 seconds, independently of form submission.

Notifications always have a private in-app record. Email uses the existing SMTP configuration and opt-in. WhatsApp uses Meta Cloud API only when `SEHAT_WHATSAPP_AUTHORIZED=true` and the token, business phone ID, Graph API version and approved English/Hindi template names are configured. Templates must be generic, have no parameters and include the organization's medical dashboard link; they must not contain medicine names or contact information. Configure `SEHAT_WA_LANGUAGE_EN` / `SEHAT_WA_LANGUAGE_HI` to match approved template locales. Provider acceptance is logged as `ACCEPTED`, never claimed as delivered; provider errors remain `FAILED` or `UNAVAILABLE` with admin retry. Opt-outs, inactive accounts and withdrawn MR invitations are rechecked before dispatch.

Tests: `src/sehat-saathi/*.spec.ts` covers validation and provider adapters with no external sends. `node scripts/verify-sehat-transaction.mjs` exercises the real database inside an always-rolled-back transaction with temporary `.invalid` accounts and disabled message providers. Browser tests are `tests/browser/sehat-saathi.spec.js` in the frontend. Regenerate scoped Bootstrap CSS after upgrading Bootstrap with `node scripts/build-sehat-css.mjs`.

Official references used for seeded resources and safeguards: [MoHFW](https://www.mohfw.gov.in/), [NHA PM-JAY](https://nha.gov.in/PM-JAY), [ERSS](https://112.gov.in/), [CDSCO](https://cdsco.gov.in/opencms/opencms/en/Home/), and [Meta template messages](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).
