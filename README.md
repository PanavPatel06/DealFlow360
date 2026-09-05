# DealFlow360 — running it locally

What the system is: `Plan.md`. What it means and who owns what: `explain.md`.
This file is only how to get it running on your machine.

## First time

Run these once, in order, from the repo root. Each one should finish before you
start the next.

```bash
npm install                 # API dependencies
npm --prefix apps/web install   # frontend dependencies (separate package)
cp .env.example .env        # .env is gitignored, everyone makes their own
```

Now you need a Postgres 16 to point at. Either works:

```bash
docker compose up -d db     # option A: the container this repo ships
brew services start postgresql@16 && createdb dealflow360   # option B: local Postgres
```

If you took option B, open `.env` and change `DATABASE_URL` to your own user,
because the file ships with the Docker credentials:

```
DATABASE_URL="postgresql://YOUR_MAC_USERNAME@localhost:5432/dealflow360?schema=public"
```

Then build the database and fill it:

```bash
npm run prisma:migrate      # creates the tables. Says "Your database is now in sync"
npm run seed                # 3 lines: roles/users, catalog, discount policies
```

## Every time after that

One command, one terminal, from the repo root:

```bash
npm run dev                 # API on :3101, web on :5173 — open http://localhost:5173
```

Ctrl-C stops both. The API is up when you see
`Nest application successfully started`; the web is up on the line that reads
`Local: http://localhost:5173/`. Their output interleaves, which is the price of
one terminal — run them apart with `npm run dev:api` and `npm run dev:web` when
you want to read one of them properly.

The browser only ever talks to :5173; Vite proxies `/api` to the backend, so
there is no CORS and no second port to remember. Port taken? Change `PORT` in
`.env` and `API_PORT` in `apps/web/vite.config.js` to match.

## Logging in

Every seeded account uses the password `password123`.

| Email | Role |
|---|---|
| `rep@dealflow.test` | sales rep, owns the demo quotes |
| `manager@dealflow.test` | first approval step |
| `finance@dealflow.test` | second approval step |
| `ops@dealflow.test` | fulfilment |
| `admin@dealflow.test` | everything |
| `buyer@acme.test` | the customer portal, scoped to Acme only |

Check the API answers:

```bash
curl -s -X POST localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"rep@dealflow.test","password":"password123"}'
```

A token comes back. Send it as `-H "authorization: Bearer <token>"` on
everything else.

## Resetting before a demo

```bash
npx prisma migrate reset --schema prisma/schema   # drops and rebuilds, then
npm run seed
```

## Checks

```bash
npm run typecheck    # tsc -b across contracts and api
npm test             # 54 unit tests
```

## When it will not start

| What you see | What it means |
|---|---|
| `Environment variable not found: DATABASE_URL` | no `.env`. Run `cp .env.example .env` |
| `User ... was denied access on the database` | `.env` credentials do not match your Postgres. Fix `DATABASE_URL` |
| `Can't reach database server at localhost:5432` | Postgres is not running. `docker compose up -d db` |
| `EADDRINUSE :::3101` | something else holds the port. Change `PORT` in `.env` and `API_PORT` in `apps/web/vite.config.js`; find the culprit with `lsof -nP -iTCP:3101 -sTCP:LISTEN` |
| the app loads but every call fails | the API did not start. Look above the Vite lines in the same terminal |
| `Cannot find module '@dealflow/contracts'` | root `tsconfig.json` is missing; `tsconfig-paths` needs it |
| `Table does not exist` | migration never ran. `npm run prisma:migrate` |

## What the app actually does

Sign in, then walk the chain. Every screen reads live API data; nothing is mocked.

| Screen | Route | What works |
|---|---|---|
| Sign in | `#/login` | five seeded roles, one click each |
| Quotations | `#/quotations` | list, create against a customer |
| Quote builder | `#/quotations/<id>` | add lines, edit qty and discount inline, the OVER badge and risk score update on every change, upsell suggestions, submit |
| Approvals | `#/approvals` | the queue, and only the role whose step is pending can approve |
| Approval detail | `#/approvals/<id>` | line-by-line reason, blended score, the append-only audit trail, approve / reject / return |
| Orders | `#/orders` | orders created by confirming a quote |
| Deal health | `#/deal-health` | stalled, low-margin and discount-anomaly signals, with a scan button |
| Customer portal | `#/portal/<token>` | what the customer sees: prices and totals, no score, no margin, no ceilings |

The portal link is on the quote builder, bottom right.

## Known gaps, so you are not surprised

- Tax is 0 on every quote: `TaxPort` is still stubbed.
- B3 has fulfilment, invoicing, subscription and payment engines with tests, but
  only its read side (`/products`, `/categories`, `/warehouses`, `/price-lists/resolve`)
  is exposed over HTTP. Those screens are absent rather than faked.
- The customer cannot yet send a negotiation message from the portal: that write
  endpoint is B3's and does not exist.
- Approval endpoints check that the step belongs to your role, but carry no
  `@Roles` guard, so any signed-in user can call them for their own role's step.
- Redis and BullMQ are not in `docker-compose.yml`; nothing schedules work yet.
