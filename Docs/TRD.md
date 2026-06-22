# Technical Requirements Document — Time-Off Microservice

**Status:** Implemented (reference build)
**Owner:** ExampleHR — Time & Attendance
**Stack:** NestJS · TypeScript · TypeORM · SQLite · Jest

---

## 1. Context

ExampleHR is the employee-facing surface for requesting time off. The **HCM**
(Human Capital Management) system — e.g. Workday or SAP — remains the **source of
truth** for employment data, including leave balances. Balances can change in HCM
**independently** of ExampleHR (for example a work-anniversary or start-of-year
refresh), and HCM is reached over the network and is not perfectly reliable.

This service, the **Time-Off Microservice**, manages the lifecycle of a time-off
request and keeps the ExampleHR view of leave balances reconciled with HCM, while
giving employees instant feedback and protecting against double-booking.

## 2. Personas

| Persona | Needs |
| --- | --- |
| **Employee** | An accurate balance and immediate feedback when filing a request. |
| **Manager** | To approve requests confident that the underlying data is valid. |

## 3. Goals and non-goals

**Goals**
- Manage the request lifecycle: `PENDING → APPROVED / REJECTED / CANCELLED`.
- Keep per-employee / per-location / per-leave-type balances consistent with HCM.
- Validate requests against HCM (the authority) and **defensively** against a local
  cache, so we never over-book even if HCM fails to return an error.
- Absorb independent HCM changes (anniversary / new-year refresh) via sync.
- Expose REST endpoints; document them with OpenAPI/Swagger.
- Be provably robust through a rigorous automated test suite.

**Non-goals**
- Building the real HCM (it is mocked).
- Authentication/authorization, multi-tenancy, and UI — out of scope for this exercise.
- A general-purpose accrual/policy engine (entitlements come from HCM).

## 4. Requirements

**Functional**
1. File a time-off request for an `(employeeId, locationId, leaveType)` and a date range.
2. Approve / reject (manager) and cancel (pending or approved).
3. Read balances and requests, with filtering.
4. Reconcile balances with HCM in real time (single) and in batch (full corpus).
5. Idempotent creation via a caller-supplied key.

**Non-functional**
- *Instant feedback*: request validation does not wait on slow background work.
- *Integrity*: no path may over-book a balance; concurrent writes are safe.
- *Defensiveness*: tolerate HCM being unavailable or failing to report an error.
- *Observability*: consistent error envelope, request logging, drift logging.
- *Testability*: every layer unit-tested; end-to-end flows tested against a mock HCM.

## 5. Key challenges

1. **Two sources of truth in tension.** HCM owns the real balance; ExampleHR must
   respond instantly. The cache can drift.
2. **Independent HCM changes.** Anniversary / new-year refreshes alter balances with
   no request from us; we must detect and adopt them without losing in-flight work.
3. **Unreliable error reporting.** HCM *usually* rejects invalid dimensions or
   insufficient balance — but "this may not be always guaranteed." We must not rely on
   HCM alone.
4. **Network failure.** HCM can be slow or down; we need a defined, safe behaviour.
5. **Concurrency.** Two requests against the same balance must not both succeed beyond
   what is available.
6. **Retries / at-least-once delivery.** Clients retry; we must not double-book.

## 6. Proposed solution

A NestJS micro-service with a **local SQLite cache** of balances and a persisted
request lifecycle. HCM is treated as **authoritative and synchronous** on the write
path; a **sync** path reconciles the cache with HCM for reads and for independent
HCM changes.

```
        Employee / Manager (REST + Swagger)
                     │
        ┌────────────▼─────────────┐
        │  Controllers (src/...)   │  validation (DTOs), error envelope
        ├──────────────────────────┤
        │  Services                │  lifecycle + balance accounting
        │   - TimeOffService       │
        │   - BalancesService      │
        │   - SyncService          │
        │   - HcmClient (iface)    │──── HTTP ───▶  HCM (source of truth)
        ├──────────────────────────┤                 (mocked in tests)
        │  TypeORM repositories    │
        ├──────────────────────────┤
        │  SQLite (balance,        │
        │          time_off_request)│
        └──────────────────────────┘
```

**Layering** is by technical role: `database/{entities,migrations}`, `services`,
`controllers`, `routes` (NestJS modules), `dtos`, `middlewares`, `filters`, `common`.
Data access is via the ORM's built-in repositories (`@InjectRepository`) — no
hand-written repository classes. Schema is owned by **migrations** (not `synchronize`).

## 7. Data model

Two tables. Balances are keyed by `(employeeId, locationId, leaveType)`.

**`balance`**

| Column | Notes |
| --- | --- |
| `id` | uuid PK |
| `employeeId`, `locationId`, `leaveType` | unique together; indexed |
| `entitledDays` | total entitlement, from HCM |
| `availableDays` | bookable days, mirrors HCM (already net of filed time-off) |
| `pendingDays` | of the filed days, how many await manager approval (informational) |
| `version` | optimistic-lock counter (concurrency) |
| `sourceUpdatedAt` | HCM's last-modified marker — detects independent changes |
| `lastSyncedAt` | when we last reconciled |
| `createdAt`, `updatedAt` | audit timestamps |

**`time_off_request`**

| Column | Notes |
| --- | --- |
| `id` | uuid PK (also used as the HCM `externalRef`) |
| `employeeId`, `locationId`, `leaveType` | dimensions; `employeeId` indexed |
| `startDate`, `endDate` | inclusive ISO dates |
| `numberOfDays` | computed from the range unless supplied |
| `status` | `PENDING / APPROVED / REJECTED / CANCELLED`; indexed |
| `idempotencyKey` | unique, nullable — safe retries |
| `decidedBy`, `decidedAt`, `reason` | approval/rejection metadata |
| `createdAt`, `updatedAt` | audit timestamps |

### Balance accounting model

`availableDays` is the **bookable** figure and always mirrors HCM, which deducts when
a request is filed. `freeToRequest = availableDays`. `pendingDays` is purely
informational (how much of the deduction still awaits approval). This keeps the cache
consistent across sync: re-pulling `availableDays` from HCM never double-counts
in-flight reservations, because HCM's value already reflects them.

| Operation | HCM | Local `availableDays` | Local `pendingDays` |
| --- | --- | --- | --- |
| File (create) | `-days` | `-days` | `+days` |
| Approve | — | — | `-days` |
| Reject / cancel-pending | `+days` | `+days` | `-days` |
| Cancel-approved | `+days` | `+days` | — |
| Sync | source | `= HCM available` | preserved |

## 8. The core decision: HCM reconciliation model

**Chosen: HCM-authoritative, synchronous.** On create, the service performs a
defensive local pre-check, then calls HCM to reserve. Only if HCM accepts is the
request persisted (`PENDING`) and the local balance mirrored. If HCM is unreachable,
the request **fails closed** with `503`.

### Alternatives considered

| Option | Summary | Why not chosen |
| --- | --- | --- |
| **A. HCM-authoritative, synchronous** (chosen) | Validate/reserve in HCM before confirming. | Strongest integrity, simplest mental model. Cost: latency and availability coupling to HCM — accepted, and mitigated by the local pre-check and a clear fail-closed rule. |
| **B. Local-authoritative, async push** | Reserve locally, return instantly, push to HCM in the background; reconcile later. | Best UX but highest divergence risk; requires a durable outbox + compensation to be correct. More moving parts than the brief warrants. |
| **C. Hybrid (reserve local, commit to HCM on approve)** | Local reserve for instant PENDING; HCM commit at approval. | Reasonable, but splits authority across two steps and complicates "is the balance real at file time?" The brief's emphasis on validity at request time favours A. |

**Defensiveness** (addresses challenge 3): even under model A we never trust HCM
alone. A local pre-check against the cached `availableDays` rejects over-booking
before HCM is called, so a lax HCM that fails to error cannot cause us to over-book
within the bounds of what our cache knows.

### Schema scope alternatives

- **Ledger table** (append-only balance transactions) — considered for audit and
  drift reconstruction; **dropped** to keep scope tight. Trade-off: less forensic
  detail; mitigated by `sourceUpdatedAt` / `lastSyncedAt` and drift logging.
- **Outbox / `sync_event` table** (durable HCM push queue with retries) — considered
  for graceful degradation when HCM is down; **dropped** in favour of fail-closed.
  Trade-off: writes are unavailable during an HCM outage. See Future work.

## 9. API design

| Method & path | Purpose |
| --- | --- |
| `GET /health` | Liveness. |
| `GET /balances` | List balances (filter by employee/location/type). |
| `GET /balances/{employeeId}/{locationId}/{leaveType}` | Single balance. |
| `POST /time-off-requests` | File a request (HCM-authoritative). |
| `GET /time-off-requests` | List requests (filter by employee/status/...). |
| `GET /time-off-requests/{id}` | Single request. |
| `POST /time-off-requests/{id}/approve` | Approve (manager). |
| `POST /time-off-requests/{id}/reject` | Reject + release. |
| `POST /time-off-requests/{id}/cancel` | Cancel + restore. |
| `POST /sync/refresh` | Realtime pull of one balance from HCM. |
| `POST /sync/batch` | Pull the full corpus from HCM (we call HCM's batch endpoint). |
| `POST /sync/import` | Ingest a corpus pushed by HCM (HCM → ExampleHR), with dimensions. |

**Error mapping** (consistent JSON envelope via a global exception filter):

| Condition | HTTP |
| --- | --- |
| Validation failure | `400` |
| Unknown request / balance | `404` |
| Illegal lifecycle transition | `409` |
| Insufficient balance / invalid dimensions (local or HCM) | `422` |
| HCM unreachable / 5xx / timeout | `503` |

## 10. Failure handling

- **HCM business rejection** → `HcmRejectionError` → `422`.
- **HCM transport failure / 5xx / timeout** → `HcmUnavailableError` → `503` (fail closed).
- **Compensation:** if HCM accepts a reservation but local persistence then fails, the
  service releases the local reservation and cancels the HCM reservation (best effort),
  so the two sides do not diverge.
- **Concurrency:** `@VersionColumn` optimistic locking guards concurrent balance writes.
- **Idempotency:** a create with a previously-seen `idempotencyKey` returns the original
  request and reserves nothing further.

## 11. Testing strategy

The value of this work is in the tests. Two layers:

- **Unit tests** (mocked repositories + mocked `HcmClient`, no I/O): each service and
  controller in isolation — balance arithmetic, lifecycle transitions and guards,
  HCM error mapping, controller delegation.
- **End-to-end / integration tests**: the real Nest application driven over HTTP
  (supertest) against a **mock HCM server** that simulates balances, reservations,
  insufficient/invalid errors, anniversary bonuses and a full outage. Scenarios:
  file → approve, defensive 422, HCM-authority 422, invalid dimensions, outage 503,
  idempotent replay, reject/cancel release & restore, anniversary sync, and the
  validation envelope.

Run: `npm test` (unit), `npm run test:e2e` (integration), `npm run test:cov` (coverage).
Coverage centres on the business-logic services (balances, time-off, sync, HCM client);
controllers/DTOs/entities are thin and exercised end-to-end.

## 12. Trade-offs, risks, future work

- **Fail-closed writes during an HCM outage.** Acceptable for integrity; a durable
  **outbox** with retries would allow graceful degradation (queue + reconcile).
- **No ledger.** Drift is detected and logged but not fully reconstructable; an
  append-only ledger would add forensic audit and exact reconciliation.
- **Calendar-day counting.** `numberOfDays` is an inclusive calendar span; a real
  system would honour working-day calendars and partial days per location policy.
- **SQLite.** Chosen per the brief; the design (migrations, repositories, optimistic
  locking) ports to Postgres with minimal change.
- **Auth.** Not implemented; would be added as a guard/middleware layer.

## 13. How to run

```bash
npm install
npm run migration:run     # create the SQLite schema
npm run mock:hcm          # terminal 1: HCM mock on :4000
npm run start:dev         # terminal 2: service on :3000  (Swagger at /docs)
```
