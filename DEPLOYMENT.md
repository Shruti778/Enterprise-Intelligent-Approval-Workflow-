# Deployment — Vercel + hosted PostgreSQL

Architecture: **Vercel (frontend) → Vercel (this Express API) → hosted PostgreSQL**.

The two halves of this project live in **separate GitHub repositories**, so each
becomes its own Vercel project with **Root Directory `./`** (not `backend/`).

| Part | Repo |
|---|---|
| API | `Enterprise-Intelligent-Approval-Workflow-` |
| UI | `Enterprise-Intelligent-Approval-Workflow-FE` |

## What makes this app Vercel-compatible

`src/server.ts` (which calls `app.listen`) stays the entry point for local
development. Vercel instead loads `api/index.ts`, which exports the same
`createApp()` Express instance as a request handler — an Express app *is* a
`(req, res)` handler. `vercel.json` routes every path to that one function, so
`app.use('/api', routes)` keeps its existing URLs. No route, middleware, or
business logic changed.

## 1. Create the production database

Any hosted Postgres works (Neon, Supabase, RDS). This app does **not** read
`DATABASE_URL` — `src/config/env.ts` expects discrete variables, so split the
provider's connection string into host / port / database / user / password.

Use the provider's **pooled** (pgBouncer) endpoint. Each warm serverless
instance holds its own Sequelize pool, so a pooler is what keeps concurrent
instances from exhausting connections. `DB_POOL_MAX` sizes that per-instance
pool (default 10; 5 is a safer starting point on Vercel).

Must be a different database from the local `approval_workflow`.

## 2. Backend environment variables (Vercel → Production)

Exactly what `src/config/env.ts` reads:

| Variable | Value | Required |
|---|---|---|
| `NODE_ENV` | `production` | recommended |
| `DB_HOST` | pooled host from the provider | **yes** |
| `DB_PORT` | `5432` (Supabase pooler: `6543`) | **yes** |
| `DB_NAME` | database name | **yes** — no default, boot fails without it |
| `DB_USER` | database user | **yes** — no default |
| `DB_PASSWORD` | database password | **yes** — no default |
| `DB_SSL` | `true` | **yes** for hosted Postgres |
| `DB_DIALECT` | `postgres` | optional (default) |
| `DB_POOL_MAX` | `5` on serverless | optional (default `10`) |
| `JWT_SECRET` | long random string | **yes** — no default |
| `JWT_EXPIRES_IN` | `12h` | optional (default) |
| `CORS_ORIGIN` | the frontend's production URL | **yes** — defaults to localhost otherwise |

`PORT` is unused on Vercel. Never commit any of these; `.env` and
`.env*.local` are gitignored.

## 3. Migrate the production database

Run from this directory. Pass the credentials **inline** — `dotenv` does not
overwrite variables that are already set, so inline values beat the local
`.env`, and the local development database is never touched:

```bash
DB_HOST=<host> DB_PORT=<port> DB_NAME=<db> DB_USER=<user> DB_PASSWORD=<pw> \
DB_SSL=true NODE_ENV=production npx sequelize-cli db:migrate
```

`src/config/sequelize-cli.config.js` prints the target (`database@host`) before
running and **refuses to run in production against `localhost`/`127.0.0.1`** —
that error means the inline variables were not picked up.

Expect 13 tables: `departments`, `roles`, `users`, `requests`,
`risk_assessments`, `risk_factors`, `workflow_definitions`, `workflow_rules`,
`workflow_step_definitions`, `workflow_instances`, `workflow_instance_steps`,
`approval_actions`, `audit_logs` (plus `SequelizeMeta`).

## 4. Seed reference data — required, and run once only

The app cannot route anything without roles, departments, and workflow
definitions. Run **only these three**, in order — the same set
`tests/globalSetup.js` treats as reference data:

```bash
# same inline credentials as above, then:
... npx sequelize-cli db:seed --seed 20250101100001-departments-and-roles.js
... npx sequelize-cli db:seed --seed 20250101100002-users.js
... npx sequelize-cli db:seed --seed 20250101100003-workflow-definitions.js
```

**These seeders are not idempotent.** They `bulkInsert` unconditionally: a
second run duplicates departments and roles, and fails on the unique email
constraint for users. Seed exactly once.

`20250101100004-demo-requests.js` is optional demo content. It registers
`ts-node` and builds its **own connection from `process.env`**, so only run it
with the inline production credentials present, or it will write to whatever
`.env` points at.

**Security:** the users seeder gives all eight demo accounts — including
`admin@company.com` — the same hardcoded password (`password123`). Acceptable
for a demo deployment; change or remove those accounts before anything real.

## 5. Deploy

```bash
npx vercel login          # interactive
npx vercel link           # once per repo
npx vercel --prod
```

Then verify, against the real deployment:

```bash
curl https://<backend>/api/health
curl -X POST https://<backend>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"employee@company.com","password":"password123"}'
```

`/api/health` does not touch the database; a successful login proves
connectivity, Sequelize, bcrypt, and JWT signing.

## 6. Frontend

No code change needed. `lib/api.ts` already reads `NEXT_PUBLIC_API_URL`; its
`http://localhost:4000/api` fallback only applies when the variable is unset,
and `.env.local` is gitignored so it never reaches Vercel. Set in the frontend
Vercel project:

```
NEXT_PUBLIC_API_URL = https://<backend>/api
```

`NEXT_PUBLIC_*` is inlined at build time — changing it requires a **redeploy**,
not just a restart.

## 7. CORS

`src/app.ts` splits `CORS_ORIGIN` on commas. After the frontend has its URL,
set `CORS_ORIGIN` to that exact origin (scheme + host, no trailing slash) and
redeploy the backend. Add preview origins explicitly if needed; do not use `*`.
