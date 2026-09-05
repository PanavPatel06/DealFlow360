# DealFlow360

A B2B quote-to-cash system. A sales rep builds a quotation, the system decides on
its own whether that discount needs a manager or finance, routes it, and turns the
approved quote into an order — every step written to an append-only audit log.

```
quote → per-line discount check → blended risk score → approval chain
      → order → warehouse split → fulfilment → invoice → payment → deal health
```

Three documents sit next to this one and do different jobs:

| File | What it is |
|---|---|
| `Plan.md` | the spec: scope, ownership, invariants, what must never be cut |
| `explain.md` | the same system in plain language, with a data-flow diagram and an ELI10 glossary |
| `design.md` | the visual system the frontend implements (colours, type scale, spacing, shadows) |

---

## Quick start

Already set up? One command, one terminal, from the repo root:

```bash
npm run dev
```

API on `:3101`, web on `:5173`. Open **http://localhost:5173** and sign in as
`rep@dealflow.test` / `password123`. Ctrl-C stops both.

---

## First-time setup

Run these once, in order. Let each finish before starting the next.

### 1. Dependencies

```bash
npm install                     # API, Prisma, tests
npm --prefix apps/web install   # the frontend is a separate package
```

### 2. Environment

```bash
cp .env.example .env
```

`.env` is gitignored — everyone keeps their own. Three variables:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | signs access tokens. Any string in dev |
| `PORT` | API port, default `3101` |

### 3. Postgres 16

**Option A — the container this repo ships:**

```bash
docker compose up -d db
```

`.env.example` already carries these credentials (`dealflow:dealflow`), so nothing
to edit.

**Option B — local Postgres:**

```bash
brew services start postgresql@16
createdb dealflow360
```

Then **you must edit `DATABASE_URL`** to your own macOS username, because the file
ships with the Docker credentials:

```
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/dealflow360?schema=public"
```

> Skipping this edit is the single most common failure. The `dealflow` role can
> connect but owns nothing, so the app starts fine and then every query dies with
> `permission denied for table quotations` (Postgres `42501`). Whichever Postgres
> creates the tables must be the one `DATABASE_URL` points at — don't mix them.

### 4. Build and fill the database

```bash
npm run prisma:migrate   # creates the tables — "Your database is now in sync"
npm run seed             # roles/users, catalog, discount policies
```

The seed runs three files in dependency order: `base.seed.ts` (roles, users,
tiers, customers) → `catalog.seed.ts` (categories, products, price list, tax
rules, warehouses, stock) → `policy.seed.ts` (the discount ceilings, which need
both tiers and categories to exist first).

### 5. Run it

```bash
npm run dev
```

---

## Running

| Command | Does |
|---|---|
| `npm run dev` | both servers, one terminal |
| `npm run dev:api` | API alone, on `PORT` |
| `npm run dev:web` | frontend alone, on `:5173` |
| `npm run typecheck` | `tsc -b` across contracts and API |
| `npm test` | 54 unit tests, 9 suites |
| `npm run seed` | re-run the seed (idempotent — upserts) |
| `npm run prisma:migrate` | apply / create migrations |
| `npm run prisma:generate` | regenerate the Prisma client after a schema edit |

The API is up on `Nest application successfully started`; the web is up on
`Local: http://localhost:5173/`. Under `npm run dev` their output interleaves —
run them apart when you need to read one properly.

**The browser only ever talks to `:5173`.** Vite proxies `/api` to the backend, so
there is no CORS and no second port to remember. If you change `PORT` in `.env`,
change `API_PORT` in `apps/web/vite.config.js` to match.

`node --watch` reloads on `.ts` changes but **not** on `.env` changes — edit
`.env`, restart the process.

### Resetting before a demo

```bash
npx prisma migrate reset --schema prisma/schema
npm run seed
```

---

## Accounts

Every seeded account uses the password `password123`. The login screen has a
one-click chip for each of the five staff accounts.

| Email | Name | Role | Sees |
|---|---|---|---|
| `rep@dealflow.test` | Riya Rep | `SALES_REP` | own quotes, own customers |
| `manager@dealflow.test` | Manish Manager | `SALES_MANAGER` | approval step 1 |
| `finance@dealflow.test` | Farah Finance | `FINANCE` | approval step 2 |
| `ops@dealflow.test` | Omar Ops | `OPS` | fulfilment |
| `admin@dealflow.test` | Aditi Admin | `ADMIN` | everything |
| `buyer@acme.test` | Anita Buyer | `CUSTOMER` | the portal, Acme only |

Seeded customers: **Acme Corp** (`CUS-1001`, GOLD tier) and **Borealis Ltd**
(`CUS-1002`, SILVER). Both in INR.

Seeded catalog:

| SKU | Product | List | Category | Type |
|---|---|---|---|---|
| `HW-LAPTOP-14` | ProBook 14 Laptop | ₹85,000 | Hardware | one-time |
| `HW-DOCK-USBC` | USB-C Docking Station | ₹12,000 | Hardware | one-time |
| `SV-ONSITE-SETUP` | Onsite Setup Service | ₹45,000 | Services | one-time |
| `SV-TRAINING-DAY` | Admin Training Day | ₹30,000 | Services | one-time |
| `SP-WARRANTY-EXT` | Extended Warranty | ₹2,500/mo | Support | recurring |

---

## The demo path

These exact numbers produce a two-step approval. Nothing is mocked — every screen
reads live API data.

1. **Sign in as the rep.** Quotations → *New quotation* → Acme Corp (GOLD).
2. **Add `ProBook 14 Laptop`, qty 24, discount 12%.** GOLD's Hardware ceiling is
   15%, so this line is clean. Risk stays LOW.
3. **Add `Onsite Setup Service`, qty 1, discount 18%.** GOLD's Services ceiling is
   10%. The line gets an **OVER 8%** badge and the blended score jumps to **51 /
   HIGH** — 18% is past the 16% finance threshold, so the chain becomes
   manager → finance.
4. **Submit.** The quote routes itself to `PENDING_MANAGER`. The rep cannot
   approve their own quote.
5. **Sign in as `manager`** → Approvals → the request shows the offending line,
   its ceiling, the excess, the blended score and the audit trail → *Approve*.
   Status moves to `PENDING_FINANCE`.
6. **Sign in as `finance`** → *Approve* → `APPROVED`.
7. **Back as the rep** → *Confirm* → an order is created (`SO-1002`), stock
   reserved, warehouse split computed.
8. **Open the portal link** (bottom right of the quote builder). The customer sees
   prices and totals — no risk score, no margin, no ceilings, no approval chain.
9. **Deal health** lists stalled quotes, low-margin quotes and discount anomalies,
   with a *Scan* button that recomputes them.

---

## How it fits together

```
apps/
  api/                    NestJS 10
    src/modules/
      sales/              B1 — auth, customers, quotes, orders, portal, state machine
      intelligence/       B2 — discount policy, risk, routing, approvals, audit, deal health
      operations/         B3 — catalog, pricing, stock, fulfilment, tax
      billing/            B3 — invoices, payments, subscription schedules
    src/shared/           JWT guard, error filter, success interceptor, Prisma service
    test/                 unit tests for the pure engines
  web/                    Vite + vanilla JS, no framework
    src/api.js            the only place that talks HTTP
    src/views.js          one function per screen, returns { html, mount }
    src/main.js           hash router + shell
    src/styles.css        design.md, implemented
packages/
  contracts/              shared TypeScript types — the seam between owners
prisma/
  schema/                 multi-file schema: base, intelligence, operations, billing
  migrations/
  seed/
```

The codebase was built by four owners working in parallel, and the boundaries are
still the useful way to read it:

| Owner | Owns | Never touches |
|---|---|---|
| **F** | `apps/web/**` | any business decision — it only renders what the API says |
| **B1** | `sales/**` — the record of truth, the state machine | risk maths, approval rules |
| **B2** | `intelligence/**` — every threshold and every audit row | quote storage |
| **B3** | `operations/**`, `billing/**` — catalog, stock, invoices | quote lifecycle |

They meet at `packages/contracts` and at two ports in
`apps/api/src/modules/sales/ports.ts` (`IntelligencePort`, `TaxPort`), so B1 could
build against a stub while B2 was still writing the real thing.

### The rules the code actually enforces

- **Money is integer minor units plus a currency** (`{ amountMinor, currency }`).
  No floats anywhere near a price.
- **Percentages are basis points.** 12% is `1200`. No rounding drift.
- **No business decision in the frontend.** The browser never computes a ceiling,
  a score or an approval chain — it asks.
- **Only `quote-state.service.ts` writes `quotations.status`,** and only along the
  legal transitions:

  ```
  DRAFT → SUBMITTED → AUTO_APPROVED | PENDING_MANAGER
  PENDING_MANAGER → PENDING_FINANCE | APPROVED | REJECTED | RETURNED
  PENDING_FINANCE → APPROVED | REJECTED
  RETURNED → DRAFT
  APPROVED | AUTO_APPROVED → CONFIRMED → FULFILLING | NEGOTIATING
  ```

- **Every transition writes an `audit_logs` row in the same transaction.** If the
  audit write fails, the transition never happened.
- **The portal is scoped server-side.** A customer token resolves to one customer;
  the response type physically omits score, margin and approval fields.
- **One error envelope:** `{ success: false, error: { code, message, details } }`.
- **Every threshold is a `discount_policies` row,** never a literal in code. Retune
  the demo by editing `prisma/seed/policy.seed.ts` and re-seeding.

### The discount policy table

Basis points. A row exists per tier, plus tighter or looser rows per category.

| Tier | Scope | Ceiling | Manager above | Finance above |
|---|---|---|---|---|
| BRONZE | default | 5% | 5% | 12% |
| BRONZE | Services | 3% | 3% | 9% |
| SILVER | default | 8% | 8% | 15% |
| SILVER | Services | 6% | 6% | 12% |
| GOLD | default | 12% | 12% | 20% |
| GOLD | Services | 10% | 10% | 16% |
| GOLD | Hardware | 15% | 15% | 22% |
| ENTERPRISE | default | 15% | 15% | 22% |
| ENTERPRISE | Services | 12% | 12% | 18% |
| ENTERPRISE | Hardware | 18% | 18% | 25% |

Target margin is 15% and a quote counts as stalled after 7 days.

### How the score is computed

`apps/api/src/modules/intelligence/engine/risk.ts`, deterministic, 0–100:

```
score = 100 × (0.5 × worst-line excess + 0.3 × weighted excess + 0.2 × margin shortfall)
```

each term normalised against the tier's manager→finance band and clamped to 0–1.
The **score is presentation**; the decision is not derived from it. The approval
chain comes straight off the policy thresholds, and `riskLevel` is read back off
the chain — so a HIGH quote is by definition one that needs finance, MEDIUM needs
a manager, LOW needs nobody.

---

## API

Everything is under `/api/v1`. All routes need `Authorization: Bearer <token>`
except `auth/login`, `auth/signup` and the portal.

```bash
curl -s -X POST localhost:3101/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"rep@dealflow.test","password":"password123"}'
```

| Method | Route | Does |
|---|---|---|
| POST | `/auth/login` `/auth/signup` `/auth/refresh` | tokens |
| GET | `/auth/me` | current user |
| GET | `/customers` `/customers/tiers` `/customers/:id` | read |
| POST · PATCH | `/customers` · `/customers/:id` | write |
| GET | `/quotes` `/quotes/:id` | list, detail |
| POST · PATCH | `/quotes` · `/quotes/:id` | create, edit header |
| POST · PATCH · DELETE | `/quotes/:id/lines` · `/lines/:lineId` | line editing |
| POST | `/quotes/:id/submit` | run evaluation, route for approval |
| POST | `/quotes/:id/confirm` | approved quote → order |
| POST | `/quotes/:id/evaluate` | re-score without saving a transition |
| GET | `/quotes/:id/evaluations` `/quotes/:id/upsell` | history, suggestions |
| GET | `/approvals` `/approvals/:id` | the queue and one request |
| POST | `/approvals/:id/approve` `/reject` `/return` | decide |
| GET | `/orders` `/orders/:id` | orders |
| PATCH | `/orders/:id/status` | advance fulfilment |
| GET | `/deal-health` `/deal-health/:quotationId` | signals |
| POST | `/deal-health/scan` `/deal-health/:id/nudge` | recompute, nudge |
| GET · PUT | `/policies/discount` · `/policies/discount/:id` | read and retune ceilings |
| GET | `/audit` | the append-only log |
| GET | `/products` `/categories` `/warehouses` `/price-lists/resolve` | catalog |
| GET · POST | `/portal/quotes/:token` · `/:token/confirm` | the customer view |

Success responses are wrapped: `{ "success": true, "data": ... }`.

---

## Data model

Thirty-odd tables across four schema files in `prisma/schema/`:

- **`base.prisma`** — `roles`, `users`, `customer_tiers`, `customers`,
  `quotations`, `quotation_lines`, `orders`, `order_lines`
- **`intelligence.prisma`** — `discount_policies`, `risk_evaluations`,
  `approval_requests`, `approval_steps`, `approval_actions`, `audit_logs`,
  `inventory_reservations`, `deal_health_events`
- **`operations.prisma`** — `categories`, `products`, `product_variants`,
  `price_lists`, `price_list_items`, `tax_rules`, `warehouses`, `inventory`,
  `inventory_movements`, `product_relationships`, `fulfillments`,
  `fulfillment_lines`, `negotiations`, `negotiation_messages`
- **`billing.prisma`** — `subscriptions`, `billing_schedules`, `invoices`,
  `invoice_lines`, `payments`

---

## Frontend

Vite + vanilla JS, ~4 files, no framework and no build step to think about.
`design.md` is implemented literally in `styles.css`: the `--solar` / `--smolder`
palette with a wide-gamut `@supports (color: lab(...))` layer, a type scale that
steps at 768 and 992 with every face at weight 400, optical `.leading-trim` from
the font metrics, the 4-6-8-12-16 radius ladder, the six-layer descending-alpha
shadow, `(hover: hover)` gating and `prefers-reduced-motion` honoured.

| Screen | Route | What works |
|---|---|---|
| Sign in | `#/login` | five staff accounts, one click each |
| Quotations | `#/quotations` | list, create against a customer |
| Quote builder | `#/quotations/<id>` | add lines, edit qty and discount inline; the OVER badge and risk score re-evaluate on every change; upsell suggestions; submit |
| Approvals | `#/approvals` | the queue; only the role whose step is pending can act |
| Approval detail | `#/approvals/<id>` | line-by-line reason, blended score, audit trail, approve / reject / return |
| Orders | `#/orders` | orders created by confirming a quote |
| Deal health | `#/deal-health` | stalled, low-margin and discount-anomaly signals, with a scan button |
| Customer portal | `#/portal/<token>` | prices and totals only — no score, no margin, no ceilings |

---

## Tests

```bash
npm test         # 54 tests, 9 suites, ~3s
npm run typecheck
```

They cover the pure engines, where the decisions live: discount ceilings, risk
scoring, approval routing, quote-state transitions, upsell selection, deal-health
detection, warehouse allocation, totals arithmetic, and auth token handling. No
database needed — the engines take plain data in and give plain data out.

---

## When it will not start

| What you see | What it means |
|---|---|
| `permission denied for table quotations` (`42501`) | `DATABASE_URL` points at a role that doesn't own the tables. See step 3 above |
| `Environment variable not found: DATABASE_URL` | no `.env`. `cp .env.example .env` |
| `User ... was denied access on the database` | wrong credentials in `DATABASE_URL` |
| `Can't reach database server at localhost:5432` | Postgres isn't running. `docker compose up -d db` |
| `EADDRINUSE :::3101` | a previous `npm run dev` is still alive. Find it: `lsof -nP -iTCP:3101 -sTCP:LISTEN`, then `kill <pid>` |
| `Port 5173 is in use, trying another one` | same, for the frontend. Vite slides to 5174; Nest doesn't slide, it dies |
| `Cannot find module '@dealflow/contracts'` | root `tsconfig.json` is missing — `tsconfig-paths` needs it |
| `The table does not exist` | migration never ran. `npm run prisma:migrate` |
| The app loads but every call fails | the API died. Scroll above the Vite lines in the same terminal |
| Schema edits have no effect | `npm run prisma:generate`, then restart |

---

## Known gaps

Stated plainly so nothing looks broken by surprise.

- **Tax is 0 on every quote.** `TaxPort` is still the stub. B3 has a working tax
  engine with seeded GST rules, but nothing resolves a jurisdiction yet.
- **B3's write side isn't exposed over HTTP.** Fulfilment, invoicing, subscriptions
  and payments have engines and tests but no controllers, so those screens are
  absent rather than faked. Only the read side (`/products`, `/categories`,
  `/warehouses`, `/price-lists/resolve`) is reachable.
- **The portal can't send a negotiation message.** The tables exist; the write
  endpoint doesn't.
- **Approval endpoints have no `@Roles` guard.** They check that the pending step
  belongs to your role, so you can't approve someone else's step — but the guard
  itself is missing.
- **No queue.** Redis and BullMQ aren't in `docker-compose.yml`; deal-health
  scanning is a button, not a schedule.
