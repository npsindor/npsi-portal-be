# CLAUDE.md

Backend API for the NPS Indore portal: Express 5 + MySQL (Sequelize, ESM). See `README.md` for setup, scripts and the API overview.

## Commands

- `npm run dev`: start the API on `API_PORT` (default 4000)
- `npm run db:migrate`: run Sequelize migrations (creates the DB if missing)
- Health check: `curl http://localhost:4000/api/health`

There is no test suite or linter configured; verify changes by running the server and hitting the affected endpoints with `curl`.

## Architecture notes

- All routes live in `server/index.js`. The generic `/api/entities/:entity` CRUD is driven by `server/entityConfig.js`; the frontend relies on this shape (it mimics Base44's `entities.X.list/filter/create/update/delete`), so don't change request/response formats without updating the frontend repo.
- The server runs pending migrations on boot (`runPendingMigrations` in `server/db.js`), so deploys don't need a manual migrate step. A broken migration is logged but does not stop the server; check the startup log.
- Schema changes go in a new file in `db/migrations-sequelize/` (`NNN-description.cjs`, CommonJS). Never edit a migration that has already run in production; add a new one instead. `db/migrations/*.sql` are legacy PostgreSQL files and are not used.
- MySQL can't index `TEXT` columns without a prefix length; use `{ name: "col", length: 255 }` in `addIndex` for those.
- `server/env.js` loads `.env.local` then `.env`; `scripts/*.mjs` and `config/database.cjs` read only `.env`.
- Passwords are hashed with scrypt as `salt:hash` (see `hashPassword`/`verifyPassword` in `server/index.js`).

## Rules

- Never commit `.env*` files (except `.env.example`), CSV exports, `uploads/`, or anything under `database/`; they contain credentials or member PII.
- Keep changes focused; match the existing compact code style in `server/index.js`.
