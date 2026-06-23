# Setup Guide — Time-Off Microservice

A step-by-step guide to install, configure, migrate, run, and verify the service.

---

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | >= 20 (developed on 22) | `node --version` |
| npm | >= 10 | `npm --version` |

No global installs are required — the NestJS CLI and TypeORM CLI come in as dev dependencies.

---

## Step 1 — Get the code

Extract the provided zip file and open a terminal in the project folder. The zip
contains all project files (everything except `node_modules`).

---

## Step 2 — Install dependencies

```bash
npm install
```

---

## Step 3 — Configure environment

A ready-to-use `.env` is included in the zip — no copying is needed. Adjust the values
only if required:

Variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `3000` | HTTP port the service listens on |
| `DB_PATH` | `./data/timeoff.sqlite` | SQLite file path (use `:memory:` for throwaway runs) |
| `DB_SYNCHRONIZE` | `false` | Keep **false** — schema is owned by migrations |
| `DB_LOGGING` | `false` | Log SQL to the console |
| `HCM_BASE_URL` | `http://localhost:4000` | Base URL of the HCM API (the mock server in dev) |
| `HCM_API_KEY` | `dev-placeholder-key` | Bearer token sent to HCM |
| `HCM_TIMEOUT_MS` | `5000` | HCM request timeout before failing closed |

---

## Step 4 — Run the database migrations

```bash
npm run migration:run
```

**What to expect:**
- The SQLite file **and its folder are created automatically** if they don't exist (e.g. `./data/timeoff.sqlite`).
- A `migrations` tracking table is created, then `balance` and `time_off_request` with their indexes and constraints.
- Output ends with:
  ```
  Migration InitSchema1782164513146 has been executed successfully.
  ```

Running it again is safe — it prints `No migrations are pending` and does nothing.

> Note: SQLite auto-creates the database file. On a server database (Postgres/MySQL) the database itself must already exist; migrations only create the tables inside it.

Other migration commands:

| Command | What it does |
| --- | --- |
| `npm run migration:run` | Apply all pending migrations |
| `npm run migration:revert` | Roll back the most recent migration |
| `npm run migration:show` | List applied (`[X]`) and pending (`[ ]`) migrations |
| `npm run migration:generate -- ./src/database/migrations/<Name>` | Generate a new migration from entity changes |

---

## Step 5 — Start the HCM mock server (recommended)

HCM is the source of truth, so write operations call it. In development, run the bundled mock:

```bash
npm run mock:hcm
```

**What to expect:** `HCM mock server listening on http://localhost:4000`. It is seeded with a couple of demo balances for `emp-001` / `loc-nyc`.

> If you skip this step, read endpoints still work, but **filing a request returns `503`** — that is the intended "fail closed when HCM is unreachable" behavior.

---

## Step 6 — Start the service

In a second terminal:

```bash
# development (auto-reload)
npm run start:dev

# OR production
npm run build
npm run start:prod
```

**What to expect:** Nest logs each module initializing and every mapped route, ending with:
```
Time-Off Microservice listening on http://localhost:3000
```

---

## Step 7 — Verify it's working

| Check | URL / command | Expected |
| --- | --- | --- |
| Health | `GET http://localhost:3000/health` | `{"status":"ok","service":"timeoff-microservice",...}` |
| Swagger UI | open `http://localhost:3000/docs` | Interactive API explorer |
| OpenAPI JSON | `http://localhost:3000/docs-json` | Raw spec |
| List balances | `GET http://localhost:3000/balances` | `[]` on a fresh DB |

### Try a full flow in Swagger (with the mock running)

1. `POST /sync/refresh` with `{ "employeeId": "emp-001", "locationId": "loc-nyc", "leaveType": "VACATION" }` — pulls the balance from HCM into the local cache.
2. `POST /time-off-requests` with a date range — creates a `PENDING` request and reserves the days.
3. `POST /time-off-requests/{id}/approve` with `{ "managerId": "mgr-1" }` — commits it.
4. `GET /balances/emp-001/loc-nyc/VACATION` — see `availableDays` / `pendingDays` update.

---

## Running the tests

```bash
npm test            # unit tests        → 42 passing
npm run test:e2e    # end-to-end tests  → 13 passing (boots the app + an in-process mock HCM)
npm run test:cov    # unit tests + coverage report (./coverage)
```

**What to expect:** all suites green (55 tests total). The e2e suite starts its **own** mock HCM on a random port and uses an in-memory SQLite DB, so it needs neither `npm run mock:hcm` nor a migrated file.

---

## API reference

| Method & path | Purpose |
| --- | --- |
| `GET /health` | Liveness |
| `GET /balances` | List balances (filterable) |
| `GET /balances/{employeeId}/{locationId}/{leaveType}` | Single balance |
| `POST /time-off-requests` | File a request (HCM-authoritative) |
| `GET /time-off-requests` | List requests (filterable) |
| `GET /time-off-requests/{id}` | Single request |
| `POST /time-off-requests/{id}/approve` | Approve (manager) |
| `POST /time-off-requests/{id}/reject` | Reject + release reservation |
| `POST /time-off-requests/{id}/cancel` | Cancel + restore balance |
| `POST /sync/refresh` | Realtime pull of one balance from HCM |
| `POST /sync/batch` | Pull the whole corpus from HCM |
| `POST /sync/import` | Ingest a corpus pushed by HCM |

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `POST /time-off-requests` returns `503` | HCM mock not running — start `npm run mock:hcm`, or check `HCM_BASE_URL`. |
| `422` on create | Insufficient balance or invalid employee/location/leaveType combination. |
| `Port 3000 already in use` | Another process is bound — stop it or change `PORT` in `.env`. |
| `no such table: balance` | Migrations not applied — run `npm run migration:run`. |
| Want a clean slate | Delete the `./data` folder, then `npm run migration:run` again. |
