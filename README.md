# nps-be

Backend API for the NPS Indore (Patidar Samaj) portal. It is an Express 5 server backed by MySQL (via Sequelize) that replaces the Base44 hosted backend while keeping the frontend's `base44.entities.*` call shape.

The frontend lives in a separate repo and talks to this API through `VITE_API_BASE_URL` (default `http://localhost:4000`).

## Requirements

- Node.js 22+
- MySQL 8.x

## Setup

```bash
npm install
cp .env.example .env        # then fill in MYSQL_PASSWORD (and SMTP_* if needed)
npm run db:migrate          # creates the database if missing and runs Sequelize migrations
                            # (the server also applies pending migrations on every start)
npm run dev                 # starts the API on http://localhost:4000
```

Check it's up:

```bash
curl http://localhost:4000/api/health
```

### Environment files

The API server loads `.env.local` first, then `.env` (values in `.env.local` win). The scripts in `scripts/` only read `.env`, so keep database settings in `.env`. See `.env.example` for all variables. Never commit `.env` files.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API server (`server/index.js`) |
| `npm run db:migrate` | Create the database if needed and run migrations in `db/migrations-sequelize/` |
| `npm run db:import` | One-time seed: import Base44 CSV exports from `./database/<Entity>_export.csv` |
| `npm run db:import-users -- <path/to/users.csv>` | Import a Base44 user export |
| `LOCAL_USER_PASSWORD=... node scripts/set-user-password.mjs <email>` | Set a user's password (user exports have no password hashes) |

## Project layout

```
server/
  index.js          Express app and all routes
  db.js             Sequelize connection
  env.js            Loads .env.local / .env
  entityConfig.js   Entity name → table/columns mapping for the generic CRUD API
  mailer.js         SMTP (nodemailer) helpers
  emailTemplates.js Email bodies
config/database.cjs Sequelize CLI config (reads MYSQL_* env vars)
db/migrations-sequelize/  Active MySQL migrations (run by db:migrate)
db/migrations/      Legacy PostgreSQL SQL migrations, kept for reference only
scripts/            Migrate, import and password utilities
.sequelizerc        Points sequelize-cli at config/ and db/migrations-sequelize/
```

## API overview

- `GET /api/health`
- Auth: `POST /api/auth/register`, `verify-otp`, `login`, `logout`, `reset-request`, `reset-password`, `change-password`, `invite`; `GET /api/auth/me`
- Current user: `GET /api/me/family`, `GET /api/me/feedback`
- Public lookups: `GET /api/verify/:familyId`, `GET /api/track/application`, `GET /api/check-mobile`, `GET /api/stats`
- Uploads: `POST /api/upload` (multipart, field `file`); files are served from `/uploads/<name>`
- Availability checks: `GET /api/check-email`, `GET /api/check-mobile`; OTP resend: `POST /api/auth/resend-otp`
- Generic entity CRUD: `GET|POST /api/entities/:entity`, `POST /api/entities/:entity/bulk`, `PATCH|DELETE /api/entities/:entity/:id`

Auth uses a bearer token (`Authorization: Bearer <token>`) returned by `/api/auth/login`. Admin-only actions require `users.role = 'admin'`.

## Uploads, rate limiting and reCAPTCHA

- Uploaded files are stored in `UPLOADS_DIR` (default `./uploads`, git-ignored). Back this folder up in production; it is not in the database.
- Auth, OTP, public lookup and upload endpoints are rate-limited per IP (`express-rate-limit`).
- Registration is protected by Google reCAPTCHA v3 when `RECAPTCHA_SECRET_KEY` is set; leave it unset locally to skip verification.

## Making a user admin

Register through the frontend, then:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## Password reset emails

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, then restart the server. If SMTP is not configured, the API logs a warning, skips sending, and returns `resetToken` in the `/api/auth/reset-request` response so the flow stays testable locally.

Note: if your local `.env` points at a real mailbox, emails sent while testing locally are delivered for real.
