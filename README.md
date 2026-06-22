# Time-Off Microservice

A NestJS + SQLite microservice that manages the lifecycle of employee **time-off requests**
and keeps **per-employee / per-location** leave balances reconciled with the **HCM**
(Human Capital Management) system, which remains the *source of truth*.

> This repository currently contains the **base template / skeleton**: it compiles, boots,
> connects to SQLite, and exposes a health endpoint. Business logic is filled in module by
> module on top of this scaffold.

## Architecture at a glance

| Module       | Responsibility                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| `balances`   | Local cache of per-employee/per-location balances; instant feedback to callers |
| `time-off`   | Request lifecycle: `PENDING → APPROVED / REJECTED / CANCELLED`                  |
| `hcm`        | Client for the HCM realtime + batch APIs, behind an interface so it is mockable |
| `sync`       | Reconciles the local cache against HCM (the source of truth); defensive checks  |
| `common`     | Cross-cutting: global exception filter, base DTOs, interceptors                |
| `config`     | Typed environment configuration + TypeORM datasource wiring                    |

The service keeps a **local SQLite store** so it can give employees instant feedback and stay
defensive when HCM is unavailable or fails to return errors. HCM remains authoritative;
the `sync` module reconciles independent HCM changes (e.g. anniversary / new-year refresh).

## Requirements

- Node.js >= 20 (developed on v22)
- npm >= 10

## Getting started

```bash
npm install
cp .env.example .env      # adjust if needed
npm run migration:run     # create the SQLite schema (migration-owned)
npm run start:dev         # http://localhost:3000
```

Health check: `GET http://localhost:3000/health`
API docs (Swagger): `http://localhost:3000/docs`

## Testing

```bash
npm test            # unit tests
npm run test:e2e    # end-to-end tests (boots the app + mock HCM)
npm run test:cov    # coverage report
npm run mock:hcm    # run the standalone HCM mock server (port 4000)
```

**Suite:** 42 unit tests + 13 end-to-end tests = **55 passing**. The e2e suite drives the
real application over HTTP against a mock HCM server, covering the full lifecycle,
defensive rejection, HCM-authority rejection, invalid dimensions, HCM outage, idempotent
replay, reject/cancel release & restore, anniversary sync, pushed-corpus import, and the
error envelope.

**Coverage (business-logic layers, `npm run test:cov`):**

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| `balances.service.ts` | 97.9% | 90% | 91.7% | 97.8% |
| `time-off.service.ts` | 86.3% | 62.1% | 81.3% | 86.9% |
| `sync.service.ts` | 100% | 100% | 83.3% | 100% |
| `hcm.service.ts` | 85.4% | 62.9% | 66.7% | 88.4% |
| `*.controller.ts` | 92–100% | 100% | 75–100% | 91–100% |

## Database & migrations

Schema is owned by **TypeORM migrations** (not `synchronize`). Data access uses the
ORM's built-in repositories (`@InjectRepository`) — no hand-written repository classes.

```bash
npm run migration:generate -- ./src/database/migrations/<Name>   # diff entities → new migration
npm run migration:run                                            # apply pending migrations
npm run migration:revert                                         # roll back the last migration
npm run migration:show                                           # list migration status
```

## Project layout (layered)

```
src/
├── main.ts                 # bootstrap: validation pipe, Swagger
├── app.module.ts           # root module: config + database + route modules + global filter
├── config/                 # env configuration (typed)
├── database/
│   ├── data-source.ts      # TypeORM CLI datasource (migrations)
│   ├── database.config.ts  # TypeOrmModule options for the running app
│   ├── entities/           # balance.entity.ts, time-off-request.entity.ts
│   └── migrations/         # generated migrations
├── controllers/            # REST controllers (route handlers)
├── services/               # business-logic services
├── routes/                 # NestJS module files (controller+service wiring)
├── middlewares/            # request-logger.middleware.ts
├── filters/                # all-exceptions.filter.ts (global handler)
└── common/                 # enums, transformers, shared helpers
test/
├── jest-e2e.json
├── app.e2e-spec.ts
└── mocks/hcm-mock-server.ts
```
