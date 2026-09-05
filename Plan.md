# plan.md

Frozen for the duration of the project. Nothing here is a status update, a checklist
or a schedule, so nothing here needs editing while you build. If something in this
file turns out to be wrong, that is a decision to reopen out loud with all four
people, not a line to quietly change.

Execution, roles and the hour-by-hour path are in `explain.md`.

---

## 1. What we are building

DealFlow360 is a B2B sales operations platform where a deal runs as one governed
pipeline:

```
quote -> per-line discount check -> blended risk score -> approval chain
      -> order -> warehouse split -> fulfillment
      -> one-time invoice + subscription -> payment -> deal health
```

A customer negotiates the live quotation from a restricted portal, and a negotiated
term that breaks a discount ceiling sends the quote back into approval on its own.

The judged property is that this chain works with real application logic. Not
feature count, not visual polish. A demo where four screens are beautiful and the
approval is faked scores worse than one where every screen is plain and the chain
is real.

## 2. Stack

Next.js, TypeScript, Tailwind, shadcn/ui and TanStack Query on the frontend.
NestJS, TypeScript and REST on the backend. Prisma against PostgreSQL. Redis with
BullMQ for scheduled work. JWT with refresh tokens and role guards. Zod and
class-validator for input. Jest, Supertest and Playwright for tests. Docker Compose
for local infrastructure.

No second ORM, no alternate state library, no UI kit beyond shadcn/ui, no service
split. Adding a runtime dependency is a group decision.

## 3. Repo layout

```
apps/
  api/
    src/modules/
      sales/           B1
      intelligence/    B2
      operations/      B3
      billing/         B3
      shared/          guards, filters, prisma service - group owned
  web/                 F
packages/
  contracts/           DTOs, enums, error codes - group owned by protocol
prisma/
  schema/              one .prisma file per domain
  seed/
    index.ts           calls the four seed files in order
    base.seed.ts       roles, users, tiers, customers - group owned
    catalog.seed.ts    B3
    policy.seed.ts     B2
    demo.seed.ts       the scripted demo data - group owned
docker-compose.yml
plan.md
explain.md
```

## 4. Four owners

One frontend, three backend. Names go in the table on day one and do not move.

| Owner | Scope | Paths |
|---|---|---|
| F, frontend | all fifteen screens, portal shell, API client | `apps/web/**` |
| B1, sales core | customers, quotations, lines, totals, orders, state machine, auth | `apps/api/src/modules/sales/**`, `prisma/schema/sales.prisma` |
| B2, intelligence | discount engine, risk score, approval routing, audit, upsell rank, allocation choice, deal health | `apps/api/src/modules/intelligence/**`, `prisma/schema/intelligence.prisma` |
| B3, operations | catalog, pricing, tax, warehouses, inventory, fulfillment, subscriptions, invoices, payments, negotiation records | `apps/api/src/modules/operations/**`, `apps/api/src/modules/billing/**`, `prisma/schema/operations.prisma`, `prisma/schema/billing.prisma` |

Table ownership, which decides who writes the migration:

- B1: `users`, `roles`, `customers`, `customer_tiers`, `quotations`,
  `quotation_lines`, `orders`, `order_lines`
- B2: `discount_policies`, `risk_evaluations`, `approval_requests`,
  `approval_steps`, `approval_actions`, `audit_logs`, `inventory_reservations`,
  `deal_health_events`
- B3: `categories`, `products`, `product_variants`, `price_lists`,
  `price_list_items`, `tax_rules`, `warehouses`, `inventory`,
  `inventory_movements`, `product_relationships`, `fulfillments`,
  `subscriptions`, `billing_schedules`, `invoices`, `invoice_lines`, `payments`,
  `negotiations`, `negotiation_messages`

Nobody edits another owner's paths. A change you need from someone else is a
request you make in chat, and they implement it.

The one asymmetry to plan around: F is a single person consuming three producers,
so F is the likeliest bottleneck. Section 9 exists to keep F unblocked.

## 5. Invariants

Breaking one is a bug even if the tests pass.

1. Money is an integer in minor units plus a currency code:
   `{ "amountMinor": 125000, "currency": "INR" }`. No floats, anywhere, ever.
   Percentages are basis points, so 18 percent is `1800`.
2. No business decision runs in the frontend. The browser formats, sorts and
   validates shape. It never decides whether a discount needs approval, what a risk
   level is, or which warehouse ships. Every such answer arrives as a response field.
3. Discount ceilings are checked per line against that line's own category ceiling
   for the customer's tier, then blended across the order. A quote where several
   lines are each slightly over must still be flagged.
4. One entity, one owning module, one Prisma model. Never declare a second model
   for a table you do not own.
5. `quotations.status` is written only by `quote-state.service.ts`.
6. Every state transition, approval action, discount override and negotiation
   response writes an `audit_logs` row in the same transaction as the change.
7. A customer-role user reads only their own customer's records, enforced server
   side on every portal endpoint, never by hiding UI.
8. One error envelope, one stable code constant. See section 8.
9. Thresholds live in `discount_policies` rows. A number that decides an outcome
   never appears as a literal in code.

## 6. Data model

Ownership marked B1, B2, B3. Arrows read "references".

```
 customer_tiers(B1) <- customers(B1) <- quotations(B1) -> quotation_lines(B1)
                                            |                    |
                                            |                    v
                                            |          products(B3) -> categories(B3)
                                            |                    |
                                            |                    v
                                            |          price_list_items(B3) -> price_lists(B3)
                                            v
                                    risk_evaluations(B2)
                                            |
                                            v
                                  approval_requests(B2) -> approval_steps(B2)
                                            |                     |
                                            |                     v
                                            |            approval_actions(B2)
                                            v
                                        orders(B1) -> order_lines(B1)
                                            |
              +-----------------------------+-----------------------------+
              |                             |                             |
              v                             v                             v
      fulfillments(B3)               invoices(B3)                subscriptions(B3)
              |                             |                             |
              v                             v                             v
 inventory_reservations(B2)         invoice_lines(B3)          billing_schedules(B3)
              |                             |                             |
              v                             v                             |
      inventory(B3) -> warehouses(B3)   payments(B3) <---------------------+
              |
              v
    inventory_movements(B3)

 negotiations(B3) -> negotiation_messages(B3)   attached to a quotation(B1)
 audit_logs(B2)          every transition, append only
 deal_health_events(B2)  stalled, discount anomaly, delivery slippage, low margin
 product_relationships(B3)  upsell and cross-sell pairs, ranked by B2
 users(B1), roles(B1)    customer role scoped to exactly one customer
```

Conventions: `cuid()` string ids, `createdAt` and `updatedAt` on every table, money
as `<name>AmountMinor Int` plus `currency Char(3)`, percentages as `<name>Bps Int`.
Enums live in `packages/contracts/src/enums.ts` and are mirrored in
`prisma/schema/base.prisma`.

Fields other owners depend on, so they are fixed here:

`quotations`: id, code, customerId, ownerUserId, status, currency, subtotalMinor,
discountMinor, taxMinor, totalMinor, marginBps, validUntil, lastActivityAt,
portalToken.

`quotation_lines`: id, quotationId, productId, description, qty, unitPriceMinor,
discountBps, lineTotalMinor, costMinor, lineType (`ONE_TIME` or `RECURRING`).

`discount_policies`: id, tierId, categoryId (null means the tier default),
maxDiscountBps, requiresManagerAboveBps, requiresFinanceAboveBps, isActive.

`risk_evaluations`: append a row per evaluation, never update one. The negotiation
flow needs the history.

`inventory`: onHand and reserved are stored. Available is derived, never stored.

`order_lines` copy the values from `quotation_lines` at confirmation. Do not join
back to the quote, because a quote can change after its order exists.

## 7. Quotation state machine

Only `quote-state.service.ts` writes status. Allowed transitions live in one table
in that file. Anything not in the table throws `QUOTE_INVALID_STATE`. This is the
first place a reviewer looks to check the workflow is real, so keep it readable.

```
DRAFT
  |
  v
SUBMITTED
  |
  +--> AUTO_APPROVED ------------------+
  |                                    |
  +--> PENDING_MANAGER                 |
         |                             |
         +--> REJECTED                 |
         +--> RETURNED --> DRAFT       |
         +--> PENDING_FINANCE          |
                |                      |
                +--> REJECTED          |
                +--> APPROVED ---------+
                                       |
                                       v
                                   CONFIRMED
                                       |
                        +--------------+--------------+
                        |                             |
                        v                             v
                   FULFILLING                   NEGOTIATING
                        |                             |
                        v                    re-evaluate risk
                    COMPLETED                  /            \
                                  within ceilings         over ceilings
                                        |                       |
                                    CONFIRMED            PENDING_MANAGER
```

Supporting lifecycles:

Inventory: `AVAILABLE -> RESERVED -> ALLOCATED -> SHIPPED`, and `RELEASED` back to
available on cancellation. Stock is never decremented directly.

Fulfillment: `ORDER_CONFIRMED, INVENTORY_RESERVED, PICKING, PACKED, SHIPPED,
DELIVERED`, plus `BACKORDERED` when a split cannot be covered.

Invoice: `DRAFT, ISSUED, PARTIALLY_PAID, PAID`, plus `VOID` and `OVERDUE`.

Subscription: `ACTIVE, PAUSED, CANCELLED`.

## 8. API contract

Base path `/api/v1`. Bearer JWT on everything except login, signup and refresh.

Success is `{ "success": true, "data": {} }`. Lists put the array in `data.items`
with `data.total`, `data.page`, `data.pageSize`. Failure is:

```json
{
  "success": false,
  "error": {
    "code": "DISCOUNT_LIMIT_EXCEEDED",
    "message": "Discount exceeds the configured category limit.",
    "details": { "quoteLineId": "line_2", "allowedBps": 1000, "actualBps": 1800 }
  }
}
```

Error codes, defined in `packages/contracts/src/errors.ts`. Adding one is routine.
Renaming one is a group decision.

| Code | HTTP |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `PORTAL_SCOPE_VIOLATION` | 403 |
| `NOT_FOUND` | 404 |
| `QUOTE_INVALID_STATE` | 409 |
| `DISCOUNT_LIMIT_EXCEEDED` | 409 |
| `APPROVAL_STEP_NOT_YOURS` | 409 |
| `INSUFFICIENT_STOCK` | 409 |
| `INVOICE_BEFORE_SHIPMENT` | 409 |
| `SUBSCRIPTION_INVALID_STATE` | 409 |

### B1, sales core

```
POST   /auth/login | /auth/signup | /auth/refresh
GET    /customers ?q=&tierId=&page=      POST /customers
GET    /customers/:id                    PATCH /customers/:id
GET    /quotes ?status=&customerId=&ownerUserId=&page=
POST   /quotes                           { customerId, currency }
GET    /quotes/:id
PATCH  /quotes/:id
POST   /quotes/:id/lines                 { productId, qty, discountBps }
PATCH  /quotes/:id/lines/:lineId         DELETE /quotes/:id/lines/:lineId
POST   /quotes/:id/submit
POST   /quotes/:id/confirm
GET    /orders ?status=&customerId=      GET /orders/:id
```

`GET /quotes/:id`, trimmed to the fields others depend on:

```json
{
  "id": "qt_1042", "code": "Q-1042", "status": "PENDING_MANAGER",
  "customer": { "id": "cus_1", "name": "Acme Corp", "tier": "GOLD" },
  "lines": [{
    "id": "line_2", "productId": "prd_9", "description": "Onsite Setup Service",
    "qty": 1, "unitPrice": { "amountMinor": 45000, "currency": "INR" },
    "discountBps": 1800, "allowedDiscountBps": 1000, "overBps": 800,
    "lineTotal": { "amountMinor": 36900, "currency": "INR" },
    "lineType": "ONE_TIME"
  }],
  "totals": { "subtotal": {}, "discount": {}, "tax": {}, "total": {} },
  "evaluation": { "riskScore": 82, "riskLevel": "HIGH", "approvalRequired": true },
  "approval": { "status": "PENDING", "currentStep": "SALES_MANAGER" }
}
```

`allowedDiscountBps` and `overBps` come from B2 and ride on the line so the builder
screen can render the OVER badge without a second round trip.

### B2, intelligence and governance

```
POST   /quotes/:id/evaluate        idempotent, safe on every line change
GET    /quotes/:id/evaluations
GET    /approvals ?status=&assignedRole=&page=
GET    /approvals/:id
POST   /approvals/:id/approve | /reject | /return    { reason }
GET    /quotes/:id/upsell
GET    /deal-health                GET /deal-health/:quotationId
POST   /deal-health/:id/nudge
GET    /audit ?entityType=&entityId=
GET    /policies/discount          PUT /policies/discount/:id
```

`POST /quotes/:id/evaluate`, the shape everything else is built on:

```json
{
  "riskScore": 82,
  "riskLevel": "HIGH",
  "approvalRequired": true,
  "requiredApprovals": ["SALES_MANAGER", "FINANCE"],
  "violations": [
    { "quoteLineId": "line_2", "categoryName": "Services",
      "allowedBps": 1000, "actualBps": 1800, "excessBps": 800 }
  ],
  "blended": { "weightedExcessBps": 460, "worstLineExcessBps": 800, "marginBps": 1140 }
}
```

### B3, commercial operations

```
GET    /products ?categoryId=&q=   POST /products
GET    /categories                 GET /tax-rules
GET    /price-lists/:id/resolve ?customerId=&productId=
GET    /warehouses                 GET /inventory ?warehouseId=&productId=
POST   /orders/:id/allocation      recommend a split, commit nothing
POST   /orders/:id/fulfillment     { allocations: [{ warehouseId, productId, qty }] }
PATCH  /fulfillments/:id/status    POST /fulfillments/:id/consolidate
GET    /subscriptions ?customerId=&status=
GET    /subscriptions/:id          PATCH /subscriptions/:id
POST   /subscriptions/:id/cancel
GET    /invoices ?status=&customerId=   GET /invoices/:id
POST   /orders/:id/invoices        splits one-time from recurring
POST   /invoices/:id/payments      { amountMinor, method, reference }
```

`POST /orders/:id/allocation`:

```json
{
  "allocations": [
    { "warehouseId": "wh_main", "warehouseName": "Main Warehouse",
      "productId": "prd_1", "qty": 22, "shipments": 1,
      "shippingCost": { "amountMinor": 4200, "currency": "INR" } },
    { "warehouseId": "wh_east", "warehouseName": "East Depot",
      "productId": "prd_1", "qty": 2, "shipments": 1,
      "shippingCost": { "amountMinor": 2900, "currency": "INR" } }
  ],
  "backorder": [],
  "totalShipments": 2
}
```

### Customer portal

Separate prefix, separate guard, separate frontend client. Every handler resolves
the caller's `customerId` from the token and filters by it. A portal response never
contains `riskScore`, `riskLevel`, approval notes, margin, cost or another
customer's data.

```
GET    /portal/quotes/:token
POST   /portal/quotes/:token/messages
       { quotationLineId?, body, requestedDiscountBps?, requestedDeliveryDate? }
POST   /portal/quotes/:token/confirm
GET    /portal/invoices            GET /portal/subscriptions
```

Confirm returns either `{ "outcome": "CONFIRMED", "orderId": "..." }` or
`{ "outcome": "APPROVAL_REQUIRED", "status": "PENDING_MANAGER" }`. The portal shows
the second as pending review, with no score and no reason detail.

## 9. Screens and how F stays unblocked

Fifteen screens. A list screen shows all records of one entity; clicking a row opens
the detail screen for one record. Routes are fixed.

| # | Screen | Route | Backed by |
|---|---|---|---|
| 1 | Login and signup | `/login`, `/signup` | B1 |
| 2 | Sales dashboard | `/dashboard` | B1, B2 |
| 3 | Quotations list | `/quotations` | B1 |
| 4 | Quotation builder | `/quotations/[id]` | B1, B2, B3 |
| 5 | Approvals list | `/approvals` | B2 |
| 6 | Approval detail, risk breakdown, audit trail | `/approvals/[id]` | B2 |
| 7 | Fulfillment and stock | `/fulfillment` | B3 |
| 8 | Warehouse split detail | `/fulfillment/[orderId]` | B2, B3 |
| 9 | Subscriptions list | `/subscriptions` | B3 |
| 10 | Billing detail | `/subscriptions/[id]` | B3 |
| 11 | Customer portal negotiation | `/portal/quotations/[token]` | B1, B3 |
| 12 | Invoices list | `/invoices` | B3 |
| 13 | Invoice detail and payment | `/invoices/[id]` | B3 |
| 14 | Deal health | `/deal-health` | B2 |
| 15 | Admin and reporting | `/admin/reports` | B2, B3 |

Screen 4 flips a line to OVER while the discount is being typed, not on submit.
Screen 6 shows why the quote was flagged, line by line, with points over. Screen 11
has its own layout and nav (My Quotation, Messages, Profile).

Because F consumes three producers, the contract in section 8 is the deliverable
that unblocks F, and it exists before any endpoint does. F builds every screen
against fixtures in `apps/web/src/mocks/` that are hand-written copies of the JSON
above, behind one flag:

```ts
// apps/web/src/lib/api.ts
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
```

Switching a screen to live data is deleting one branch, not rewriting a component.
A screen F cannot demo against mocks is a screen the contract underspecified, and
that is worth catching in hour two rather than hour twenty.

## 10. Integration rules

One repository, one database, one canonical model per entity.

Branches: `main`, plus `f/<feature>`, `b1/<feature>`, `b2/<feature>`,
`b3/<feature>`.

1. `main` must start and seed at all times. If a merge breaks that, revert first
   and debug on a branch.
2. Rebase on `main` before opening a PR and again before merging.
3. Never edit another owner's paths. Ask, and let them implement.
4. Never edit or delete an applied migration. Add a new one.
5. Migrations are named `<owner>_<what>`, so `b2_approval_steps`. Two people
   running `prisma migrate dev` at the same minute is the one race worth
   announcing in chat first.
6. Prisma uses the multi-file schema folder. Cross-domain relation fields are
   declared on the owning side only; the other side stores the id.
7. Integrate every two hours at the checkpoints in `explain.md`. Long-lived
   branches are how a four-person build fails.
8. Commits carry no assistant co-author or attribution trailers.

Things that require agreement from all four before starting, because they break
everyone at once: adding, renaming or removing a shared enum value; changing the
response shape or status code of a published endpoint; a new runtime dependency;
anything in `apps/api/src/modules/shared/**`, `packages/contracts/**`,
`docker-compose.yml`, `.env.example` or auth middleware; widening what the portal
role can read.

## 11. Definition of done

A piece of work is done when the migration is written and applied, the DTO is
validated, authorization is checked server side, the endpoint matches section 8,
the frontend has loading, empty and error states, any calculation has a unit test,
the seed lets the path be demonstrated without manual setup, `pnpm typecheck`,
`pnpm lint` and `pnpm test` pass, and the browser console is clean.

## 12. Decisions already made

Modular monolith, not services. Four modules in one process, boundaries enforced by
path ownership. Services would add deployments, discovery and distributed debugging
inside a day and buy nothing a judge can see.

Money as integer minor units. Floating point produces totals that are wrong by a
rupee and indefensible when someone adds up the line items.

Deterministic engines, language models only for prose. Discounts, risk, routing,
tax, totals, allocation and reservations are code with tests. A model may turn a
computed result into a sentence, and its output is never parsed back into a
decision. The problem statement asks for business rules in application logic, and a
model in the approval path is also non-deterministic on stage.

Per-line ceilings blended into one score. A tier-level check alone passes a quote
with a services line eight points over, and passes an order with five lines each two
points over.

Prisma multi-file schema. Four people adding models to one file conflict on almost
every integration.

Portal as a separate surface, not a role flag on the same screens. Separate prefix,
layout, client and guard. Some duplicated UI is the price, and sharing the component
is exactly how internal fields leak.

Payments simulated, subscriptions billed without proration. Both are visible gaps.
Say so in the demo rather than implying they work.

## 13. What we would build next

Proration on mid-cycle subscription changes. Real gateway settlement and credit
notes. Learned upsell ranking from actual co-purchase history rather than seeded
pairs. Approval delegation and out-of-office routing, which is the first thing a
real sales organisation asks for. Multi-currency price lists, which the money
representation already permits but no engine reads yet.
