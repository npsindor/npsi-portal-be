# nps-be

Backend API for the NPS Indore (Patidar Samaj) portal: NestJS + TypeScript (strict) backed by MySQL (raw SQL through Sequelize). It replaced the Base44 hosted backend while keeping the frontend's `base44.entities.*` call shape.

The frontend lives in a separate repo and talks to this API through `VITE_API_BASE_URL` (default `http://localhost:4000`). Interactive API docs: **`/api/docs`** (Swagger UI), JSON at `/api/docs-json`.

## Requirements

- Node.js 22+
- MySQL 8.x

## Setup

```bash
npm install
cp .env.example .env        # then fill in MYSQL_PASSWORD (and SMTP_* if needed)
npm run db:migrate          # creates the database if missing and runs Sequelize migrations
                            # (the server also applies pending migrations on every start)
npm run dev                 # builds and starts the API on http://localhost:4000
```

Check it's up:

```bash
curl http://localhost:4000/api/v1/health
```

### Environment files

The API server loads `.env.local` first, then `.env` (values in `.env.local` win; variables already set in the process environment win over both). The scripts in `scripts/` only read `.env`, so keep database settings in `.env`. See `.env.example` for all variables. Never commit `.env` files.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build and start the API (`dist/main.js`) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled API |
| `npm test` | Unit tests (services, no database) |
| `npm run test:cov` | Unit tests with coverage; fails below 80% |
| `npm run test:e2e` | e2e tests: every endpoint through the real app on a throwaway MySQL database |
| `npm run test:contract` | Contract tests (black-box, every endpoint) against the built app |
| `npm run test:contract:legacy` | The same contract tests against the legacy Express app on the old paths |
| `npm run check` / `lint` / `format` | Biome: check (lint + format), lint only, format files |
| `npm run dev:legacy` | Run the legacy Express server (`server/index.js`, old `/api/...` paths) |
| `npm run db:migrate` | Create the database if needed and run migrations in `db/migrations-sequelize/` |
| `npm run db:import` | One-time seed: import Base44 CSV exports from `./database/<Entity>_export.csv` |
| `npm run db:import-users -- <path/to/users.csv>` | Import a Base44 user export |
| `LOCAL_USER_PASSWORD=... node scripts/set-user-password.mjs <email>` | Set a user's password (user exports have no password hashes) |

The e2e and contract tests create and drop their own databases (`npsi_e2e_test`, `npsi_contract_test`) using the MySQL credentials from `.env`; they never touch the configured database, and they disable SMTP and reCAPTCHA.

## Project layout

```
src/
  main.ts, app.module.ts, configure-app.ts   Bootstrap and HTTP setup (CORS, JSON limit, prefix, pipes, filter, Swagger)
  config/       Env loading (.env.local, .env), validated env schema, typed AppConfigService
  database/     DatabaseService: raw-SQL access and the boot-time migration runner
  common/       Error filter and { error } body, auth guards, rate limiters, mail, reCAPTCHA, sessions, helpers
  modules/      Feature modules: health, auth, me, lookups, uploads, entities
  testing/      Unit-test fakes and the e2e harness
  e2e/          e2e tests
tests/contract/ Black-box contract tests (legacy and v1 path tables)
server/         Legacy Express app (kept for comparison until the deploy switches to dist/main.js)
config/database.cjs Sequelize CLI config (reads MYSQL_* env vars)
db/migrations-sequelize/  Active MySQL migrations (run by db:migrate and on boot)
db/migrations/  Legacy PostgreSQL SQL migrations, kept for reference only
scripts/        Migrate, import and password utilities
docs/           Migration plan and report
```

## API overview

All routes are under `/api/v1` (full details in Swagger at `/api/docs`):

- `GET /health`
- Auth: `POST /auth/registrations`, `POST /auth/otp-verifications`, `POST /auth/otps`, `POST /auth/sessions` (login), `DELETE /auth/sessions/current` (logout), `POST /auth/password-resets`, `POST /auth/password-resets/confirmations`, `PUT /auth/password`, `POST /auth/invitations` (admin), `GET /auth/me`
- Current user: `GET /me/family`, `GET /me/feedback`
- Public lookups: `GET /family-verifications/:familyId`, `GET /application-status?applicationId=&mobile=`, `GET /mobile-availability?mobile=`, `GET /email-availability?email=`, `GET /stats`
- Uploads: `POST /uploads` (multipart, field `file`); files are served from `/uploads/<name>` (outside `/api/v1`)
- Entities, one resource each (`announcements`, `applications`, `events`, `event-registrations`, `families`, `family-members`, `feedback`, `notifications`, `principles`, `rules`, `samitis`, `samiti-members`, `students`, `student-applications`, `transactions`, `transfer-requests`): `GET|POST /<resource>`, `POST /<resource>/batch`, `PATCH|DELETE /<resource>/:id`

Errors are always `{ "error": "<message>" }`. Auth uses a bearer token (`Authorization: Bearer <token>`) returned by login or OTP verification. Admin-only actions require `users.role = 'admin'`.

## Uploads, rate limiting and reCAPTCHA

- Uploaded files are stored in `UPLOADS_DIR` (default `./uploads`, git-ignored). Back this folder up in production; it is not in the database.
- Auth, OTP, public lookup and upload endpoints are rate-limited per IP (`express-rate-limit`).
- Registration and application forms are protected by Google reCAPTCHA v3 when `RECAPTCHA_SECRET_KEY` is set; leave it unset locally to skip verification.

## Making a user admin

Register through the frontend, then:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## Password reset emails

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, then restart the server. If SMTP is not configured, the API logs a warning and skips sending; the reset token is never returned in the API response, so without SMTP read it from the database to test the flow locally.

Note: if your local `.env` points at a real mailbox, emails sent while testing locally are delivered for real.
