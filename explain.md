# explain.md

The plain-language half. `plan.md` says what the system is and freezes it. This says
what each of the four of you does, how data actually moves between you, and what
every term means in words a 10 year old would understand.

Read section 1, the diagram in section 2, and your own role in section 3. Come back
to sections 4 and 5 whenever a word doesn't make sense.

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

Every line looks almost fine. Together the salesperson has quietly given away a lot.
The software adds up the overages across the whole offer and flags it anyway. That
combined number is the **blended risk score**.

Everything else in the project exists to carry that idea from the offer through to
the money.

---

## 2. The data flow diagram

Think of this as a river. Water (a deal) starts as a **quote**, and by the time it
reaches the sea it has become **money in the bank**. Along the way it passes through
four dams, and each dam is owned by one person.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              F  (the screens)                              │
│   Every box below is something F draws on screen. F never decides          │
│   anything inside a box — F only asks and shows the answer.                │
└────────────────────────────────────────────────────────────────────────────┘

   SALESPERSON                                          MANAGER  →  FINANCE
        │                                                     ▲         │
        ▼                                                     │         ▼
 ┌─────────────┐    add line     ┌─────────────┐   evaluate  ┌───────────────┐
 │   QUOTE     │ ───────────────▶│  QUOTE +    │────────────▶│   APPROVAL    │
 │  (B1 owns)  │                 │  LINES      │  (B2 owns)  │   CHAIN       │
 │ DRAFT       │◀────────────────│  (B1 owns)  │             │  (B2 owns)    │
 └─────────────┘   price lookup  └─────────────┘             └───────┬───────┘
        │           (B3 owns)           │                            │
        │ submit                        │ every discount is checked  │ approved
        ▼                               │ against B3's product +     │
 ┌─────────────┐                        │ category ceiling, blended  ▼
 │ PENDING_    │                        │ into one score by B2  ┌───────────┐
 │ MANAGER/    │◀───────────────────────┘                        │ CONFIRMED │
 │ FINANCE     │                                                  │ (B1 owns) │
 └─────────────┘                                                  └─────┬─────┘
                                                                         │
                       ┌─────────────────────────────────────────────────┤
                       ▼                                                 ▼
              ┌──────────────────┐                              ┌──────────────┐
              │   ORDER           │                              │ NEGOTIATION   │
              │   (B1 owns, a     │                              │ (B3 owns —    │
              │   frozen copy)    │                              │ customer      │
              └────────┬──────────┘                              │ portal)       │
                       │                                          └──────┬────────┘
      ┌────────────────┼────────────────┐                                │
      ▼                ▼                ▼                     re-evaluate│(B2)
┌───────────┐   ┌─────────────┐   ┌─────────────┐             back into approval
│ WAREHOUSE  │   │ INVOICE     │   │ SUBSCRIPTION │            if it breaks a ceiling
│ SPLIT +    │   │ (one-time   │   │ (recurring   │
│ FULFILMENT │   │ money)      │   │ money)       │
│ (B3 owns,  │   │ (B3 owns)   │   │ (B3 owns)    │
│ B2 does the│   └──────┬──────┘   └──────┬───────┘
│ split math)│          │                 │
└─────┬──────┘          ▼                 ▼
      │           ┌────────────────────────────┐
      ▼           │          PAYMENT            │
  stock reserved, │        (B3 owns)            │
  then shipped    └──────────────┬──────────────┘
                                  ▼
                         ┌──────────────────┐
                         │   DEAL HEALTH      │
                         │  dashboard, watches│
                         │  everything above  │
                         │  (B2 owns)         │
                         └────────────────────┘
```

Read it like this: data only ever flows **forward** through the pipe, except one
loop — a customer's negotiation message can push a confirmed quote backward into
approval again, on its own, if the new number breaks a ceiling. That one loop is the
whole reason section 4 exists.

Four colours, four owners, one pipe. Nobody's box touches another owner's box
directly — every arrow that crosses an owner boundary is really "F asks, backend
answers," never "one backend module reaches into another's database table."

---

## 3. Who does what, role by role

### F — builds every screen, decides nothing

Imagine F is the person drawing the dashboard of a car: the speedometer, the fuel
gauge, the warning lights. F does not decide the car's actual speed or how much fuel
is left — the engine (the backend) tells the dashboard what to show, and F just
paints it clearly. If a warning light needs to turn on, the engine says "turn it on,"
F never guesses.

- Builds all 15 screens plus the customer portal.
- Never writes a rule like "if discount over 15%, show a warning" — that number
  could change tomorrow, and F's code would then be lying.
- Builds every screen against **fake, hand-written data first** (see section 6),
  so F is never sitting around waiting for someone else to finish.

### B1 — owns the deal record itself

Think of B1 as the shop's paper filing cabinet. B1 keeps the actual folder for each
customer and each offer: what's in it, what it's worth, what stage it's at. B1 is
the only one allowed to write "APPROVED" on the front of a folder — but B1 asks B2
first whether it's *allowed* to write that.

- Owns customers, quotations, quotation lines, totals, orders, login.
- Owns the **one file** that is allowed to change a quote's status
  (`quote-state.service.ts`). Nobody else touches quote status, ever.
- Doesn't know what "risky" means — B1 just asks B2 and obeys the answer.

### B2 — owns every decision

B2 is the strict teacher grading homework. B2 doesn't do the homework (that's B1 and
B3's job) — B2 just says "this line is over the limit," "this whole offer is high
risk," "this needs the manager AND finance to sign off," and writes every grade down
in a permanent notebook (the audit log) that never gets erased.

- Owns the discount-ceiling check, the blended risk score, who has to approve,
  the audit trail, which warehouse should ship what, which deals look unhealthy.
- Never changes an offer's status directly — B2 only ever *answers a question*.
  B1 is the one who acts on the answer.

### B3 — owns the things and the money

B3 is the warehouse manager and the accountant rolled into one. B3 knows what's on
the shelf, what it costs, how much tax applies, which truck it ships on, and keeps
the ledger of bills sent and money received. B3 also runs the customer's "argue about
the price" mailbox.

- Owns products, prices, tax rules, warehouses, stock, shipping, invoices,
  subscriptions, payments, and the negotiation messages from the customer portal.

### The one rule that keeps four people from breaking each other

You only ever edit files inside your own folder (`plan.md` section 4). If you need
something from someone else's folder, you *ask them in chat* and they do it. Never
open their files — not for a one-line fix, not at 3am. This single rule is why four
people can work for hours without stepping on each other.

---

## 4. The negotiation loop

The customer logs into a completely separate part of the site and sees their own
offer only — no risk score, no approval notes, no profit margin, no other customer's
data. That restriction is enforced on the server, not by hiding buttons, because
hiding a button is not security — a curious customer could still ask for the hidden
data directly, and the server has to refuse on its own.

The customer types: *can the warranty be 15 percent instead of 10?* B3 saves that as
a message. The salesperson applies it. B1 changes the line, asks B2 to check again,
and if it's now over a ceiling, the offer goes back into approval **automatically** —
nobody has to notice and click a button. If the request had stayed inside the
ceilings, it would sail straight through.

## 5. The two hard rules, and why

**Rule one: no thinking in the frontend.** F never writes `if (discount > 15)
showWarning()`. The number 15 lives in a database row an admin can change. If F
copies it into a screen, changing the real rule stops actually changing anything —
the demo would show a warning that's a lie.

**Rule two: money is never a decimal.** Every amount is a whole number of paise
(so ₹1,250 is stored as `125000`), and every percentage is a whole number of
hundredths of a percent (so 18% is `1800`). This is because computers are bad at
decimals — ask a computer for `0.1 + 0.2` and it says `0.30000000000000004`. Nobody
wants that showing up as a total that's one rupee off, live, in front of a judge.

---

## 6. Working alone without breaking each other

**The contract comes before the code.** `plan.md` section 8 already spells out the
*exact* shape of every answer the backend will send, decided before anyone writes a
line. F doesn't need B1 to finish anything — F already knows precisely what shape
the answer will eventually take, the way you can set the table before the food is
cooked because you already know what dishes are coming.

**F builds against fake data first.** F hand-writes those exact answer-shapes into
`apps/web/src/mocks/` and builds every screen against them, behind one on/off switch.
When B1's real endpoint is ready, F flips the switch for that one screen — deleting
one line, not rewriting the screen. This is what stops F, the only frontend person
facing three backend people, from spending the whole project waiting.

**Merge every two hours.** Everyone stops, pushes, and checks that a fresh database
still starts and seeds. Two hours of work is a survivable thing to throw away. Ten
hours is not.

---

## 7. Concepts, explained like you're 10

**Quotation (or "quote", or "offer").** A price you're proposing to someone before
they've said yes. Like telling a friend "I'll trade you my sticker for your two
stickers" — nothing has actually been swapped yet, you can still change your mind.

**Order.** What the quote turns into once both sides agree. Once you've actually
swapped the stickers, that trade is locked in — you can't quietly go back and change
what was traded. That's why an order *copies* the quote's numbers instead of looking
them up live: the quote might keep changing after the order is made.

**Tier.** How good a customer you are, like a video game rank — Bronze, Silver,
Gold, Enterprise. Better rank, bigger discounts you're allowed.

**Ceiling.** The biggest discount allowed for one kind of thing. Like a rule that
says "you can get up to 3 candies free, but only 1 free chocolate bar" — different
things have different limits, even for the same kid.

**Basis point.** A tiny slice of a percent — one hundredth of one percent. We use it
instead of "18%" so the computer only ever deals with whole numbers (18% becomes
`1800`), never a number with a messy decimal point.

**Minor units.** The smallest coin a currency has, like counting in cents instead of
dollars. ₹1,250 becomes `125000` paise. Same reason as basis points: whole numbers
only, no decimals to get slightly wrong.

**Blended risk score.** One single number from 0 to 100 that adds up how far *every*
line in the offer went over its own ceiling. It exists because four lines that are
each "a little" over add up to "a lot" over, even though no single line looks scary
by itself.

**Approval chain.** The list of people who have to say "yes" in order, like a permission
slip that needs mum's signature, and dad's too if it's for something big enough. Here
it's the sales manager, then finance if it's bad enough.

**Audit log.** A diary that writes down everything that happened and never lets
anyone tear a page out. If something goes wrong later, you can always read back
exactly who did what, and when.

**Reservation.** Setting stock aside for one order so nobody else can also be
promised it — like putting a "sold" sticker on a toy the moment someone says they
want it, even before they've paid, so it can't be sold twice.

**Split.** When one order's laptops come from more than one warehouse because no
single warehouse has enough — like getting half your order of cookies from the
kitchen and the other half from the pantry.

**Backorder.** The part of the order nobody has stock for yet — an IOU for later.

**Proration.** Charging only a fair slice of a month's fee when someone changes
their subscription partway through the month, like only paying for the second half
of a bus pass if you started using it halfway through the month. **This project is
not building this** — it's a known, admitted gap.

**Deal health.** A dashboard that watches every deal in flight and flags the ones
that have gone quiet for too long, look unusual, or are about to miss a delivery
promise — like a smoke detector for deals, not for fires.

**State machine.** A strict rulebook for what can turn into what. A quote can go
`DRAFT → SUBMITTED → PENDING_MANAGER`, but it can never jump straight from `DRAFT` to
`APPROVED` — there's no arrow for that on the map, so the software refuses to let it
happen, the same way a board game's rules say which squares you're allowed to move
between.

**Portal.** The customer's own separate door into the building — different hallway,
different rooms, and the front desk (the server) checks their ID on every single
door before letting them see anything, rather than just not showing them the door in
the lobby.

**Contract-first / mocks.** Agreeing exactly what a finished LEGO piece will look
like *before* anyone starts building it, so everyone can build their own piece at the
same time and know for certain they'll click together at the end — instead of
building blind and hoping.

---

## 8. The twenty-four hours

Hour 0 is when the repo is created. Every block ends with a merge into `main` and a
thirty-second check that a fresh database still works.

**Hours 0 to 2, foundation. Everyone together, nothing else starts.**
Repo, Docker with Postgres and Redis, Prisma set up with one schema file per person,
login working with roles, the empty Next.js shell with all fifteen routes reachable,
and a seed that creates five users and a few customers.
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

## 9. The demo

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
