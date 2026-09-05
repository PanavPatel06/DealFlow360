# explain.md

The plain-language half. `plan.md` says what the system is. This says what each of
the four of you does, in what order, and what happens to a piece of data as it moves
between you.

Read section 1 and your own role section. Read the rest when you get stuck.

---

## 1. The whole thing in one story

A shop sells laptops. A salesperson makes a price offer to a company, the company
argues about the price, someone senior decides whether the discount is allowed, the
laptops get taken off shelves in warehouses, a bill goes out, and money comes back.

That is the software. All of it.

The interesting part is one rule. Every product has a maximum discount it is allowed
to have, and different kinds of product have different maximums. Laptops are allowed
15 percent off. Setup service is allowed only 10 percent, because there is much less
profit in it.

So a salesperson writes an offer:

```
Laptop           24 units    12% off     allowed 15%    fine
Setup service     1 unit     18% off     allowed 10%    8 points too much
```

The customer is a good customer who is allowed 15 percent overall, so 18 looks fine
at a glance. It is not fine, because the setup service line broke its own stricter
rule. The software has to notice that by itself and send the offer to a manager,
without the salesperson pressing a button asking for permission.

Second version of the same trick. Nothing is badly wrong, but small things add up:

```
Laptop           2 points over
Mouse            3 points over
Cable            2 points over
Warranty         2 points over
```

Every line looks almost fine. Together the salesperson has quietly given away a
lot. The software adds up the overages across the whole offer and flags it anyway.
That combined number is what we call the blended score.

Everything else in the project exists to carry that idea from the offer through to
the money.

## 2. Who does what

Four people. One builds the screens, three build the machinery behind them.

**F builds every screen.** All fifteen of them, plus the customer-facing portal. F
never decides anything: when a screen needs to know whether a discount is too big, it
asks the backend and shows the answer it gets back.

**B1 owns the deal record.** Customers, offers, the lines inside an offer, the
totals, orders, and login. B1 also owns the one file that is allowed to change an
offer's status. B1 does not know what a risk score is. B1 asks B2.

**B2 owns the decisions.** Is this discount allowed, how bad is it, who has to
approve it, what happened and when, which warehouse should ship, what deals look
stuck. B2 never touches an offer's status directly. B2 answers questions and B1 acts
on the answer.

**B3 owns the things and the money.** Products, prices, tax, warehouses, stock,
shipping, invoices, subscriptions, payments, and the record of what a customer asked
for during negotiation.

The rule that keeps this from collapsing: you only ever edit files inside your own
folder, listed in `plan.md` section 4. If you need something from someone else's
folder, you ask them in chat and they do it. Never open their files, not even for a
one-line fix, not even at 3am when they are asleep. That single rule prevents most
of the ways a four-person build breaks.

## 3. What happens to one offer, step by step

Follow one number: a laptop at 12 percent off and a setup service at 18 percent off,
for a company called Acme.

**Step 1. Salesperson opens a new offer.** F shows an empty builder screen. F asks
B1 to create an offer for Acme. B1 makes a row in the `quotations` table with status
`DRAFT` and gives back its id.

**Step 2. Salesperson adds the laptop.** F asks B1 to add a line. B1 does not know
what a laptop costs, so B1 asks B3 for the price for this customer, because different
customers are on different price lists. B3 answers 120,000 minor units. B1 saves the
line and recalculates the offer total.

**Step 3. Salesperson types a discount of 12 percent.** F sends it to B1 with every
keystroke. B1 saves it and asks B2 to evaluate the whole offer. B2 looks up what this
customer's tier is allowed for this product's category, sees 15 percent allowed
against 12 percent given, and reports no problem. B1 passes B2's answer back inside
the offer, and F paints the line green. Nothing is blocked. A salesperson is allowed
to type a bad number; the software just has to know it is bad.

**Step 4. Salesperson adds setup service at 18 percent.** Same path, different
answer. B2 looks up the services category, sees a 10 percent ceiling, and reports the
line as 800 basis points over, which is 8 percentage points. B2 blends this into a
score of 82 out of 100, calls it HIGH, and says two people have to approve it: the
sales manager, then finance. F paints that line red and shows OVER while the person
is still typing.

**Step 5. Salesperson submits.** F asks B1 to submit. B1 asks B2 to evaluate one more
time, because the answer during typing is advice and the answer at submit is binding.
B2 says approval is required, creates an approval request with two waiting steps, and
writes a line in the audit log saying who submitted what and when. B1 moves the offer
from `SUBMITTED` to `PENDING_MANAGER`. The salesperson never asked for approval. It
happened because the numbers demanded it.

**Step 6. Manager approves.** F shows the manager a screen listing why the offer was
flagged, line by line. The manager clicks approve. B2 records the action, writes
another audit line, and moves to the finance step. B2 tells B1 the offer is still
pending, so B1 leaves the status at `PENDING_FINANCE`.

**Step 7. Finance approves.** B2 records it, sees no steps left, and tells B1 the
approval is complete. B1 moves the offer to `APPROVED`, then to `CONFIRMED` when the
salesperson confirms, and creates an order by copying the offer's lines into
`order_lines`. Copying matters: the offer can change afterwards, and the order must
remember what was actually agreed.

**Step 8. Stock.** B3 knows there are 22 laptops in the main warehouse and 4 in the
east depot, and the order needs 24. B2 works out the split, 22 from one and 2 from
the other, two shipments, and reports the cost. Nobody has taken anything off a shelf
yet: this is a recommendation. When someone accepts it, B2 reserves the stock and B3
records the movement. Available stock drops. If the order is cancelled, the
reservation is released and the stock comes back. Nothing is ever subtracted
directly, because that is how software ends up selling the same laptop twice.

**Step 9. Bills.** The order has laptops and setup service, paid once, and a care
plan paid every month. B3 makes one invoice for the one-time things and one
subscription with a schedule of future dates for the monthly thing. Same order, two
different kinds of money.

**Step 10. Payment.** Someone records that the money arrived. B3 marks the invoice
paid.

**Step 11. Watching.** All along, B2 has been noting things: this offer has not moved
in nine days, that salesperson usually gives 8 percent and just gave 22, this delivery
promise is about to be missed. Those go on a dashboard.

## 4. The negotiation loop

The customer logs into a completely separate part of the site and sees their own
offer. They see prices and totals. They do not see the risk score, the approval
notes, the profit margin, or anything about any other customer. That restriction is
enforced on the server, not by hiding buttons, because hiding buttons is not
security.

The customer types: can the warranty be 15 percent instead of 10? B3 saves that as a
message. The salesperson sees it and applies it. B1 changes the line, asks B2 to
evaluate again, and B2 says this is over the ceiling, so the offer goes back into
approval automatically. If the customer's request had been within the ceilings, it
would have gone straight through with no manager involved.

That loop is the second thing the judges will look at, because it is the part most
teams fake.

## 5. The two hard rules, and why

**Rule one: no thinking in the frontend.** F never writes code like
`if (discount > 15) showWarning()`. Ever. The number 15 lives in a database row that
an admin can change. If F copies it into a React component, then changing it in the
admin screen stops working, and the demo now contains a lie. When F needs a
judgement, the API sends the judgement, not the raw materials for making one.

**Rule two: money is never a decimal.** Every amount is a whole number of paise, and
every percentage is a whole number of hundredths of a percent, so 18 percent is
stored as 1800. Computers get 0.1 + 0.2 wrong. On a demo screen this shows up as a
total that is one rupee off from the sum of the lines, in front of a judge, with no
time to fix it. Divide by 100 only when printing.

## 6. Working alone without breaking each other

You will each work alone for hours at a time. Three things make that safe.

**The contract comes before the code.** `plan.md` section 8 already contains the
exact shape of every response, decided before anyone writes a line. B1 does not have
to finish for F to start, because F already knows exactly what B1 will eventually
return.

**F builds against fake data first.** F writes those response shapes into
`apps/web/src/mocks/` by hand and builds all fifteen screens against them, behind one
switch. When B1's endpoint is real, F flips the switch for that screen. This is the
single most important thing in the project for F, because F is one person waiting on
three, and without it F spends the day blocked. It also finds contract mistakes early:
if F cannot build a screen from the mock, something in the contract is missing, and
that is much cheaper to discover in hour two than hour twenty.

**Merge every two hours.** At each checkpoint in section 7, everyone stops, pushes,
merges into `main`, and one person checks that `main` still starts and still seeds.
Two hours of work is a survivable thing to throw away. Ten hours is not.

If two of you both think you need to change the same file, that is a five-minute
conversation, not a merge conflict at hour twenty.

## 7. The twenty-four hours

Hour 0 is when the repo is created. Every block ends with a merge into `main` and a
thirty-second check that a fresh database still works.

**Hours 0 to 2, foundation. Everyone together, nothing else starts.**
Repo, Docker with Postgres and Redis, Prisma set up with one schema file per person,
login working with roles, the empty Next.js shell with all fifteen routes reachable,
and a seed that creates five users and a few customers. Four people building on a
broken skeleton is the most expensive failure available, so this is worth doing
jointly and properly.
Checkpoint: log in as each of the five users, land on the right home screen.

**Hours 2 to 6, offers exist.**
B1 builds customers, offers, lines and totals. B3 builds products, categories, prices
and tax, and seeds a catalogue. B2 builds the ceiling lookup, so a line can be
compared against its own limit, but no scoring yet. F builds screens 1 to 4 against
mocks and switches screens 1 and 3 to live as soon as B1 lands.
Checkpoint: build the Acme offer and see the setup service line turn red at 18
percent.

**Hours 6 to 10, the centrepiece.**
B2 builds the blended score, the routing rules read from the database, the approval
steps and the audit log. B1 builds the state machine and the submit and confirm
transitions. F builds screens 5 and 6. B3 makes sure hardware and services really do
carry different ceilings in the seed.
Checkpoint: an offer goes from typing to approved, through two people, without anyone
touching the database.
If the clock is slipping, protect this block and cut from the end of the day instead.

**Hours 10 to 13, stock.**
B3 builds inventory and fulfilment records. B2 builds the split calculation, the
reservations, and the upsell ranking. B1 creates orders on confirm. F builds screens
7 and 8 and the upsell panel on screen 4.
Checkpoint: 24 laptops split across two warehouses, accepted, stock reserved.

**Hours 13 to 16, money.**
B3 builds the invoice split, the subscription schedule and payment recording. F
builds screens 9, 10, 12 and 13. B1 moves orders through fulfilment states. B2 starts
on deal health.
Checkpoint: one order produces one invoice and one subscription, and the invoice can
be paid.

**Hours 16 to 19, the customer side.**
F builds screen 11 with its own layout and its own restricted client. B3 stores the
negotiation messages. B2 re-evaluates on the customer's terms. B1 handles re-entry
into the approval flow.
Checkpoint: a customer counter-offer sends the quote back to a manager by itself, and
trying to open another customer's quote is refused by the server.

**Hours 19 to 21, the dashboard and the admin screen.**
B2 finishes stalled deals, discount anomalies and slippage. F builds screens 14 and
15. If there is spare time, this is where a language model writes one sentence
explaining a risk result that has already been calculated. That sentence is
decoration. It never decides anything.

**Hours 21 to 23, freeze.**
No new features. Bugs on the demo path only. Reset the database from clean and walk
both demo flows twice, because things break the second time that worked the first.
One person rehearses the five minutes out loud with a timer.

**Hours 23 to 24, buffer.** Something will need it. Something always does.

**If you fall behind, cut in this order and say so out loud in the demo rather than
faking it:** reporting filters, product variants, manual override of the warehouse
split, subscription changes and proration, the language model sentence, delivery
slippage.
**Never cut:** per-line ceilings, the blended score, the approval chain, the
warehouse split, the two kinds of billing, and the portal sending a quote back for
approval. Those six are the project.

## 8. The demo

Five minutes, two flows, one customer throughout. Reset the database first. Have two
browser profiles open, internal in one and the customer portal in the other, because
switching profiles is faster and less risky than logging out on stage.

**Flow one, about three minutes.** Log in as the salesperson. Glance at the
dashboard for one sentence, do not tour it. Create the Acme offer. Add the laptop at
12 percent and watch it stay green. Add the setup service at 18 percent and watch it
turn red while you are still typing. Say the sentence that matters out loud: this
customer is allowed 15 percent, and 18 is above it, but the real reason this is
flagged is that services carry a stricter limit of their own. Accept an upsell
suggestion and watch the total move. Submit. Switch to the manager, show the line by
line reason and the audit trail, approve. Switch to finance, approve. Go to
fulfilment, show the two-warehouse split, accept it. Go to billing, show one invoice
and one subscription from the same order. Record the payment.

**Flow two, about ninety seconds.** Switch to the customer profile. Point out that
there is no risk score and no margin anywhere on the screen, and that this is enforced
on the server. Ask for a bigger discount on the warranty. Switch back, apply it, and
show the offer re-entering approval without anyone asking it to.

**Closing thirty seconds.** Open the deal health dashboard, click one alert, land on
the offer it refers to. Say it once: this is one platform where a deal runs from offer
to payment with governance, stock and customer negotiation inside the lifecycle,
rather than four systems sitting next to each other.

**If something breaks on stage:** open the audit trail and say what the state machine
expected, rather than opening the database. Give it twenty seconds, then move to flow
two and come back only if there is time.

## 9. Words you will hear all day

**Quotation or offer.** The price proposal before anyone commits. Editable.

**Order.** What the offer becomes once both sides agree. A frozen copy.

**Tier.** How good a customer is. Bronze, Silver, Gold, Enterprise. Better tier,
bigger discounts allowed.

**Ceiling.** The maximum discount allowed for one kind of product for one tier.

**Basis point.** One hundredth of a percent. 18 percent is 1800 bps. We use these so
there are no decimals anywhere.

**Minor units.** The smallest coin. 1,250 rupees is 125000. Same reason.

**Blended risk score.** One number between 0 and 100 that combines how far every line
is over its own ceiling. Decides who has to approve.

**Approval chain.** The list of people who must say yes, in order. Manager, then
finance if it is bad enough.

**Audit log.** An append-only diary of who did what and when. Never edited, never
deleted.

**Reservation.** Stock set aside for an order but not yet shipped. Stops the same
laptop being promised twice.

**Split.** One order taking stock from more than one warehouse.

**Backorder.** The part of an order there is no stock for yet.

**Proration.** Charging a fair part of a month when a subscription changes mid-month.
We are not building this. Say so.

**Deal health.** The dashboard for deals that have gone quiet, look unusual, or are
about to miss a delivery date.
