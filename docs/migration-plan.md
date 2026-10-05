# NestJS migration plan

Migrate the backend from Express 5 + JavaScript (`server/index.js`) to NestJS +
TypeScript with **zero business-behavior change**, move every endpoint to
standardized `/api/v1/...` paths, and update the frontend (`npsi-portal-fe`) to match.

## 1. Current backend inventory

### Stack
- Express 5, plain JavaScript (ESM), single file `server/index.js` (~820 lines)
- MySQL via Sequelize 6, used only as a raw-SQL runner (`sequelize.query`); no models
- Schema managed by `sequelize-cli` migrations in `db/migrations-sequelize/` (run on boot)
- `multer` for uploads, `nodemailer` for email, `express-rate-limit`, `cors`, `dotenv`

### Cross-cutting behavior (must be preserved)
| Concern | Current behavior |
|---|---|
| CORS | Allows no-origin requests, `https://*.npsindore.org`, `https://*.hostingersite.com`, `http://localhost[:port]`; `credentials: true`; other origins error |
| Body parsing | JSON, 2 MB limit |
| Trust proxy | `TRUST_PROXY` hop count (default `1`) |
| Auth | `Authorization: Bearer <session_token>`; user row where `session_token` matches and `session_expires_at > NOW()` |
| Auth errors | `401 {"error":"Authentication required."}`, `403 {"error":"Admin access required."}` |
| Error format | Every error is `{"error": "<message>"}`; unhandled errors use `error.status` or 500 |
| Rate limits | auth 20/15 min, OTP 10/10 min, public lookups 30/15 min, uploads 40/15 min (per IP, standard `RateLimit` headers) |
| Record mapping | Entity rows returned with `created_at`→`created_date`, `updated_at`→`updated_date`, JSON-looking strings parsed |
| Write sanitizing | Date-like strings normalized to MySQL datetime; `<`/`>` rejected for non-admins; server-assigned sequential IDs |
| Static files | `GET /uploads/<file>` serves `UPLOADS_DIR` (7-day cache, no index) |
| Boot | Connects to DB, then runs pending migrations; migration failure is logged but not fatal |

### Endpoints
Auth column: **public**, **user** (any logged-in user), **admin**, or a mixed rule described in the notes.

| # | Method | Current path | Inputs | Success | Errors | Auth / limiter |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/health` | – | 200 `{ok, database, env}` | 503 `{ok:false, error}` | public |
| 2 | POST | `/api/auth/register` | body `email, password, full_name?, phone, recaptchaToken?` | 201 `{user, requiresOtp:true}` | 400 reCAPTCHA / validation, 409 phone or email taken | public, auth limiter |
| 3 | POST | `/api/auth/verify-otp` | body `email, otpCode` | 200 `{user, access_token}` | 400 bad/expired code, 404 account not found | public, OTP limiter |
| 4 | POST | `/api/auth/resend-otp` | body `email` | 200 `{ok:true}` (same whether account exists) | 400 email missing | public, OTP limiter |
| 5 | POST | `/api/auth/login` | body `email` or `phone` or `username`, `password` | 200 `{user, access_token}` | 401 invalid credentials, 403 not verified | public, auth limiter |
| 6 | POST | `/api/auth/reset-request` | body `email` | 200 `{ok:true}` (always) | 400 email missing | public, auth limiter |
| 7 | POST | `/api/auth/reset-password` | body `resetToken, newPassword` | 200 `{ok:true}` | 400 invalid input / invalid or expired token | public, auth limiter |
| 8 | POST | `/api/auth/invite` | body `email, role?, full_name?, phone?` | 201 `{ok, username, password}` | 400 email missing, 401, 403 | admin |
| 9 | POST | `/api/auth/change-password` | body `currentPassword, newPassword` | 200 `{ok:true}` | 400 short password, 401 not logged in or wrong current password | user, auth limiter |
| 10 | GET | `/api/auth/me` | – | 200 public user `{id, email, full_name, phone, role}` | 401 | user |
| 11 | POST | `/api/auth/logout` | – | 204 | – | bearer optional |
| 12 | GET | `/api/me/family` | – | 200 `{family, members, student}` | 401 | user |
| 13 | GET | `/api/me/feedback` | – | 200 `[feedback…]` (max 100) | 401 | user |
| 14 | GET | `/api/verify/:familyId` | path `familyId` | 200 `{family, members}` (limited columns) | 404 | public, lookup limiter |
| 15 | GET | `/api/track/application` | query `applicationId, mobile` | 200 application record | 400 missing params, 404 | public, lookup limiter |
| 16 | GET | `/api/check-mobile` | query `mobile` | 200 `{taken}` | – | public |
| 17 | GET | `/api/check-email` | query `email` | 200 `{taken}` | – | public |
| 18 | GET | `/api/stats` | – | 200 `{families, members}` | – | public |
| 19 | POST | `/api/upload` | multipart field `file` (JPEG/PNG/WEBP/GIF, ≤5 MB) | 201 `{file_url}` | 400 wrong type / too big / missing | public, upload limiter |
| 20 | GET | `/api/entities/:entity` | query `filter` (JSON), `order` (default `-createdAt`), `limit` (1–500, default 100) | 200 `[record…]` | 401, 403, 404 unsupported entity | Event/Announcement/Rule/Principle public; Notification user (own family + broadcast only); others admin |
| 21 | POST | `/api/entities/:entity` | body = record fields | 201 created record | 400 validation / markup / reCAPTCHA, 401, 403 ownership, 404 event not found, 409 mobile/email taken | Application/StudentApplication/Transaction/Notification public; Family/FamilyMember ownership (Family admin-only for create); Feedback/EventRegistration/TransferRequest user; others admin |
| 22 | POST | `/api/entities/:entity/bulk` | body `{records:[…]}` | 201 `[record…]`, or 200 `[]` when empty | 401, 403 | admin |
| 23 | PATCH | `/api/entities/:entity/:id` | body = fields to update | 200 updated record | 400 markup, 401, 403 ownership, 404 record not found | Family/FamilyMember ownership; Notification user (own); others admin |
| 24 | DELETE | `/api/entities/:entity/:id` | – | 204 | 401, 403 ownership | FamilyMember ownership; others admin |

Entities served by #20–24 (`server/entityConfig.js`): Announcement, Application, Event,
EventRegistration, Family, FamilyMember, Feedback, Notification, Rule, Principle, Samiti,
SamitiMember, Student, StudentApplication, Transaction, TransferRequest.

### Data layer
- MySQL tables listed above plus `users` and `SequelizeMeta`; all access is parameterized raw SQL
- No ORM models; the NestJS app keeps the same raw SQL through a shared `DatabaseService`

### Environment variables (names unchanged)
`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `API_PORT`,
`FRONTEND_URL`, `UPLOADS_DIR`, `TRUST_PROXY`, `APP_ENV`, `RECAPTCHA_SECRET_KEY`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAILS`.
Loaded from `.env.local` then `.env` (existing process env wins).

### External integrations
- Google reCAPTCHA v3 `siteverify` (skipped when `RECAPTCHA_SECRET_KEY` is empty)
- SMTP via nodemailer (skipped with a warning when SMTP is not configured)
- No cron jobs or background workers

## 2. Frontend call sites (`npsi-portal-fe`)
All live calls go through `src/api/base44Client.js` (imported by 38 files), so the frontend
change is confined to that one file.

| Line | Call | Endpoint |
|---|---|---|
| 54 | `integrations.Core.UploadFile` | `POST /api/upload` |
| 68–76 | `entities.<X>.list/filter/create/bulkCreate/update/delete/deleteMany` | `/api/entities/:entity[...]` (#20–24) |
| 84 | `auth.login` | `POST /api/auth/login` |
| 90 | `auth.register` | `POST /api/auth/register` |
| 93 | `auth.verifyOtp` | `POST /api/auth/verify-otp` |
| 97 | `auth.resendOtp` | `POST /api/auth/resend-otp` |
| 98 | `auth.resetPasswordRequest` | `POST /api/auth/reset-request` |
| 99 | `auth.resetPassword` | `POST /api/auth/reset-password` |
| 100 | `auth.changePassword` | `POST /api/auth/change-password` |
| 101 | `auth.me` | `GET /api/auth/me` |
| 103 | `auth.logout` | `POST /api/auth/logout` |
| 132 | `users.inviteUser` | `POST /api/auth/invite` |
| 150 | `me.family` | `GET /api/me/family` |
| 151 | `me.feedback` | `GET /api/me/feedback` |
| 153 | `verifyFamily` | `GET /api/verify/:familyId` |
| 155 | `trackApplication` | `GET /api/track/application` |
| 156 | `checkMobileTaken` | `GET /api/check-mobile` |
| 157 | `checkEmailTaken` | `GET /api/check-email` |
| 158 | `stats` | `GET /api/stats` |

Not in scope:
- `src/api/appClient.js` duplicates part of `base44Client.js` but is imported nowhere (dead code).
- `src/pages/OAuthConsent.jsx` calls Base44 platform endpoints (`/api/apps/...`), not this backend.

## 3. Path mapping (old → new)
Rules: `/api/v1` prefix, plural kebab-case resource nouns, no verbs, at most one level of
nesting. Response bodies, status codes and business logic stay exactly the same; only
paths (and the method where noted) change.

| # | Old | New | Notes |
|---|---|---|---|
| 1 | `GET /api/health` | `GET /api/v1/health` | |
| 2 | `POST /api/auth/register` | `POST /api/v1/auth/registrations` | creates an unverified account |
| 3 | `POST /api/auth/verify-otp` | `POST /api/v1/auth/otp-verifications` | |
| 4 | `POST /api/auth/resend-otp` | `POST /api/v1/auth/otps` | issues a new OTP |
| 5 | `POST /api/auth/login` | `POST /api/v1/auth/sessions` | creates a session; stays 200 |
| 6 | `POST /api/auth/reset-request` | `POST /api/v1/auth/password-resets` | |
| 7 | `POST /api/auth/reset-password` | `POST /api/v1/auth/password-resets/confirmations` | token stays in the body, never the URL |
| 8 | `POST /api/auth/invite` | `POST /api/v1/auth/invitations` | |
| 9 | `POST /api/auth/change-password` | `PUT /api/v1/auth/password` | method POST → PUT (replaces own password) |
| 10 | `GET /api/auth/me` | `GET /api/v1/auth/me` | |
| 11 | `POST /api/auth/logout` | `DELETE /api/v1/auth/sessions/current` | method POST → DELETE; stays 204 |
| 12 | `GET /api/me/family` | `GET /api/v1/me/family` | |
| 13 | `GET /api/me/feedback` | `GET /api/v1/me/feedback` | |
| 14 | `GET /api/verify/:familyId` | `GET /api/v1/family-verifications/:familyId` | |
| 15 | `GET /api/track/application` | `GET /api/v1/application-status?applicationId=&mobile=` | |
| 16 | `GET /api/check-mobile` | `GET /api/v1/mobile-availability?mobile=` | |
| 17 | `GET /api/check-email` | `GET /api/v1/email-availability?email=` | |
| 18 | `GET /api/stats` | `GET /api/v1/stats` | |
| 19 | `POST /api/upload` | `POST /api/v1/uploads` | served files stay at `/uploads/<file>` (URLs are stored in the DB) |
| 20 | `GET /api/entities/:entity` | `GET /api/v1/<resource>` | same `filter`, `order`, `limit` query params |
| 21 | `POST /api/entities/:entity` | `POST /api/v1/<resource>` | |
| 22 | `POST /api/entities/:entity/bulk` | `POST /api/v1/<resource>/batch` | |
| 23 | `PATCH /api/entities/:entity/:id` | `PATCH /api/v1/<resource>/:id` | |
| 24 | `DELETE /api/entities/:entity/:id` | `DELETE /api/v1/<resource>/:id` | |

`<resource>` for each entity:

| Entity | Resource path | Entity | Resource path |
|---|---|---|---|
| Announcement | `announcements` | Notification | `notifications` |
| Application | `applications` | Principle | `principles` |
| Event | `events` | Rule | `rules` |
| EventRegistration | `event-registrations` | Samiti | `samitis` |
| Family | `families` | SamitiMember | `samiti-members` |
| FamilyMember | `family-members` | Student | `students` |
| Feedback | `feedback` | StudentApplication | `student-applications` |
| Transaction | `transactions` | TransferRequest | `transfer-requests` |

Existing quirks found while writing the contract tests. They are **preserved as-is**
(changing them would be a behavior change and needs explicit approval):
- Logout without a bearer token returns `500` with the raw driver message
  `Positional replacement (?) 0 has no entry in the replacement map (replacements[0] is undefined).`
- On create, a client-supplied `id` overrides the generated UUID wherever the non-admin
  field whitelist does not strip it (admins and the public-create entities).

Known, intended differences that follow from the path change (no business change):
- An unsupported entity used to be `404 {"error":"Unsupported entity: X"}` on `/api/entities/X`; with one route per resource, an unknown resource is a plain unknown route (still `404 {"error": ...}`).

## 4. Target architecture
NestJS + TypeScript (strict), feature modules under `src/modules/`: `health`, `auth`, `me`,
`public-lookups` (family verification, application status, availability checks, stats),
`uploads`, and `entities` (one controller per resource sharing one service that holds the
current generic entity rules). Shared pieces live in `src/common` (bearer-auth guards,
`{error}` exception filter, rate-limit guards, record mapping and SQL helpers), `src/config`
(validated env, same names) and `src/database` (the raw-SQL `DatabaseService` and the
boot-time migration runner). Swagger at `/api/docs`. Biome replaces linting/formatting.

## 5. Testing strategy
1. **Contract tests** (Jest + Supertest, black-box over HTTP) are written first against the
   current Express app. Each run starts the app on a throwaway MySQL database
   (`npsi_contract_test`, recreated per run), with SMTP and reCAPTCHA disabled and a unique
   `X-Forwarded-For` per request so rate limits don't interfere.
2. The same suite then runs against the NestJS app; only the path table changes in Phase 3.
3. Unit tests per service (repositories and mail mocked), e2e tests per endpoint.
