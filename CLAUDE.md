# CLAUDE.md — ApproveFlow Backend

Node + Express + TypeScript REST API for ApproveFlow. PostgreSQL via Sequelize
(migrations + seeders), JWT + bcrypt auth, Zod validation.

Pipeline that defines this system:

```
Request → Risk Engine → Workflow Engine → Approval Workflow → Final Decision
```

The same request type routes to different approval chains depending on amount,
risk score, urgency, department, and vendor history. All of that logic lives
here — the frontend (`../frontend`, separate git repo) only renders results.

## Commands

```bash
npm run dev              # nodemon + ts-node on :4000
npm run build            # tsc -p tsconfig.json → dist/
npm start                # node dist/server.js
npm run typecheck        # src + tests
npm test                 # jest --runInBand (needs Postgres)
npm run test:coverage
npm run test:e2e         # scripts/e2e-test.js, full API run against a live server

npm run db:create
npm run db:migrate
npm run db:seed
npm run db:reset         # undo all → migrate → seed
```

## Layout

```
src/
  server.ts              bootstrap: DB check, then listen
  app.ts                 express assembly: cors → json → routes → notFound → errorHandler
  config/                env.ts (validated env), database.ts (Sequelize instance)
  routes/                one router per resource, mounted under /api
  controllers/           thin HTTP layer only
  middleware/            authenticate, authorize, validate, errorHandler
  services/
    risk/                riskRules.ts (rule set), riskEngine.ts (scoring)
    workflow/            ruleEvaluator.ts (rule matching), workflowEngine.ts (instantiation/stages)
    approval/            approvalService.ts (transactional state machine)
    requestService.ts    create / submit / resubmit / simulate
    authService.ts  auditService.ts
  models/                13 Sequelize models; index.ts owns ALL associations
  validators/schemas.ts  Zod schemas
  types/domain.ts        domain unions + AUDIT_ACTIONS
  utils/                 ApiError, response, presenters, asyncHandler, jwt, password, currency
migrations/  seeders/     numbered, append-only
tests/  unit/ integration/ e2e/ helpers/
```

## Rules

### Layering (non-negotiable)
1. **Route → middleware → controller → service → model.** A layer may only call
   the one below it.
2. **Controllers are thin.** Parse `req`, call one service, return via
   `sendSuccess` / `sendCreated`. No queries, no business rules, no `try/catch`
   — wrap every handler in `asyncHandler` and let errors reach `errorHandler`.
3. **All business logic lives in `services/`.** Services never touch `req` or
   `res`; they take plain arguments (e.g. `actor: { id, role }`) and return data
   or throw `ApiError`.
4. **Only models/services talk to the database.** No Sequelize calls in
   controllers, middleware, or routes. No raw SQL unless a query is impossible
   with the query builder, and then it must be parameterised.
5. Domain rules belong in the engine that owns them: risk scoring in
   `services/risk/`, chain selection in `services/workflow/`, state transitions
   in `services/approval/`. Do not inline a risk or routing rule elsewhere.

### HTTP contract
6. Response envelope is fixed. Success: `{ success: true, message?, data }` via
   `sendSuccess`/`sendCreated` only. Failure: `{ success: false, error: { code,
   message, details? } }` produced solely by `errorHandler`. Never
   `res.json` a bare object from a controller.
7. **Every error is an `ApiError`** thrown from a service using the factories
   (`ApiError.badRequest/unauthorized/forbidden/notFound/conflict/unprocessable`).
   No `res.status(...).send(...)` error paths, no leaking raw driver errors.
8. Sequelize error mapping lives in `errorHandler` only. Extend it there when a
   new driver error class needs handling.
9. **Every input is validated with Zod** through `validate(schema, source)`
   before the controller runs — body, query, and `:id` params
   (`idParamSchema`). Schemas live in `src/validators/schemas.ts`. A controller
   must never see an unvalidated payload.
10. Routes are registered in `src/routes/*Routes.ts` and mounted in
    `routes/index.ts` under `/api`. Keep paths RESTful and use verbs only for
    real state transitions (`POST /requests/:id/submit`). Keep specific routes
    (`/stats`) before parameterised ones (`/:id`).
11. Responses are shaped by `utils/presenters.ts`. Never return a raw Sequelize
    instance — it leaks columns (including `passwordHash`) and internal shape.

### Auth & authorization
12. `authenticate` is applied with `router.use(authenticate)` at the top of each
    protected router. Never re-parse the `Authorization` header by hand; never
    trust a user id from the body or query — use `req.user`.
13. `authorize(...roles)` is the coarse gate. Fine-grained checks (is this step
    addressed to this role, is the actor the requester) stay in the approval
    service. A requester must never approve their own request.
14. Passwords go through `utils/password.ts` (bcrypt); tokens through
    `utils/jwt.ts`. No direct `bcrypt`/`jsonwebtoken` imports elsewhere, and no
    password hash ever appears in a response.

### Data & schema
15. **Schema changes require a new numbered migration.** Never edit an applied
    migration, and never rely on `sequelize.sync()`. Every migration is
    reversible (`down` implemented).
16. A model change and its migration land in the same change, and must agree on
    columns, types, nullability, defaults, and indexes.
17. Convention: `underscored: true` with camelCase attributes and explicit
    `field` mappings; `tableName` set explicitly; enums declared in the model
    and in the migration.
18. **All associations are declared in `src/models/index.ts`** with explicit
    `foreignKey` and `as`. Import models from `../models`, never from a model
    file directly, so associations are guaranteed to be loaded.
19. Money is `DECIMAL(14,2)` and comes back from `pg` as a string — normalise to
    `number` at the model boundary (see `Request.amount`); currency strings
    come from `formatINR` in `utils/currency.ts`.
20. Type-specific request fields go in the `metadata` JSONB column; do not add a
    column per request type.
21. **Multi-row state changes run in a transaction.** Approval/rejection, stage
    advancement, and workflow instantiation must be atomic — pass the
    transaction down, don't open a second one.
22. `approval_actions` and `audit_logs` are **append-only**. Never update or
    delete a row there.
23. Every meaningful state change writes an audit entry via `auditService` with
    an action from `AUDIT_ACTIONS` in `types/domain.ts`. No ad-hoc action strings.
24. Seeders are for reference/demo data only. Application code must never read
    from or depend on seeded ids.

### Config & types
25. All env access goes through `src/config/env.ts`. No `process.env` reads
    anywhere else; required vars use `required()` so the process fails fast.
    Add every new var to `.env.example`.
26. `strict` TypeScript. No `any` in new code, no `@ts-ignore`. Domain unions
    (`RequestType`, `RequestStatus`, `RiskLevel`, `RoleName`, `StepStatus`, ...)
    are defined once in `src/types/domain.ts` as `as const` arrays + derived
    types — reuse them in models, Zod schemas, and services instead of retyping
    string literals. Keep them in sync with the frontend's `types/index.ts`.

### Testing
27. Tests live under `tests/` split into `unit/` (pure engines: risk rules, rule
    evaluator), `integration/` (HTTP through supertest + real Postgres), and
    `e2e/`. Helpers and fixtures go in `tests/helpers/`.
28. Any change to the risk engine, workflow engine, or approval state machine
    requires tests: sequential and parallel chains, rejection, RBAC denial, and
    persistence after restart.
29. Integration tests share one database and run with `maxWorkers: 1` — tests
    must clean up their own rows and never assume execution order or a
    pre-seeded state they did not create.
30. Tests target `<DB_NAME>_test` (set by `tests/env.setup.js`). Never point a
    test run at the development database.
31. Before declaring work done, run `npm run typecheck && npm test`; run
    `npm run test:e2e` for changes that touch the request → approval flow.

### General
32. Never commit `.env` or real credentials.
33. Keep `morgan` logging out of tests, and keep `console` use to the error
    handler's 5xx path — services report problems by throwing `ApiError`.
