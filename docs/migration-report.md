# NestJS migration report

The backend was migrated from Express 5 + JavaScript to NestJS 12 + TypeScript (strict), its
endpoints moved to standardized `/api/v1` paths, and the frontend updated to match. Business
behavior is unchanged: the same black-box contract suite (82 tests) passes against the legacy
Express app on the old paths and against the NestJS app on the new paths.

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

## Test results (final run)

| Repo | Check | Result |
|---|---|---|
| Backend | `npm run check` (Biome lint + format, 70 files) | pass, 0 diagnostics |
| Backend | `npm run build` (tsc, strict) | pass |
| Backend | `npm test` (unit, 92 tests) | 92/92 pass |
| Backend | `npm run test:e2e` (29 tests, every v1 endpoint, real MySQL) | 29/29 pass |
| Backend | `npm run test:contract` (NestJS, v1 paths) | 82/82 pass |
| Backend | `npm run test:contract:legacy` (Express, old paths) | 82/82 pass |
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
| database.service.ts | 21.6% | 50.0% | 0% (needs a real DB; exercised by e2e and contract tests) |
| **All services** | **93.5%** | **95.9%** | **98.2%** |

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

### Existing quirks kept on purpose (fixing them would change behavior; say if you want them fixed)
- Logout without a bearer token returns `500` with the raw driver message
  `Positional replacement (?) 0 has no entry in the replacement map (replacements[0] is undefined).`
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
2. **Hostinger build settings.** Production currently starts `server/index.js` without a build
   step (`entry_file: server/index.js` in `.github/workflows/deploy.yml` and the Hostinger build
   settings). The NestJS app needs `npm run build` and `entry_file: dist/main.js`, and the build
   needs the dev dependencies (`typescript`). Update the deploy workflow and Hostinger settings,
   then verify on the test environment first.
3. **Remove the legacy server** (`server/`, `dev:legacy`, `test:contract:legacy` and the legacy
   path table) once production runs `dist/main.js`.
4. **Swagger in production**: `/api/docs` is public. That's fine for an API whose security doesn't
   rely on secrecy, but it can be limited to non-production if preferred.
