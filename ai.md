# ai.md

Optional. Read once, build from it only after the deterministic chain works.

Nothing in this file is required for the project to succeed. Every item is written
so it can be added later without changing a table, an endpoint or a state machine.

---

## 1. Where AI stands in the project today

```
  DECIDES THINGS                          DESCRIBES THINGS
  ----------------------------------      ------------------------------
  discount ceilings                       "why is this deal high risk?"
  blended risk score                      "what changed since last approval?"
  approval routing                        "what did the customer actually ask for?"
  tax, totals, invoices                   "why two shipments instead of one?"
  warehouse split                         "draft a reply to this customer"
  stock reservation                       "turn this sentence into a draft quote"
  subscription schedule

  plain code, tested, no network          model calls, optional, cached
  MUST NEVER BE A MODEL                   SAFE PLACE FOR A MODEL
```

`plan.md` section 12 already fixes this line, and `explain.md` gives the right-hand
column one slot near hour 20. Nothing is built yet. This file is the menu.

## 2. The one rule

A model output is allowed to take exactly two shapes.

```
  SHAPE A - PROSE                      SHAPE B - PROPOSAL
  ------------------------------       ---------------------------------
  computed result                      free text from a human
        |                                    |
        v                                    v
     model writes a sentence            model extracts structured fields
        |                                    |
        v                                    v
     shown on screen                     shown as a SUGGESTION card
        |                                    |
        v                                    v
     nothing is stored                   human clicks Apply
                                             |
                                             v
                                        normal deterministic endpoint runs
                                        normal validation, normal audit row
```

What is never allowed:

```
   model output ----> writes a status, a price, a discount, a reservation
   model output ----> parsed back into a number that decides an outcome
   model output ----> reached without the deterministic result existing first
```

If the API key is missing, the quota is spent, or the call times out, every feature
here falls back to something plain and the demo continues. Write the fallback first,
then the model call.

## 3. How it plugs into the architecture

One new module. Owned by B2, because governance already lives there.

```
apps/api/src/modules/ai/
  ai.module.ts
  ai.service.ts          generateText(), generateJson<T>()
  ai.controller.ts       only for endpoints that are purely AI
  prompts/
    risk-explanation.md
    negotiation-intent.md
    ...                  prompts are files, not string literals in code
```

Everything else calls `AiService`. Nobody else talks to a model provider.

```
   B1 sales ----+
                |
   B2 intel ----+---> AiService ---> Redis cache ---> provider HTTP
                |         |            (hash of        (server side only,
   B3 ops   ----+         |             input)          key never reaches
                          |                             the browser)
   F --------------------/
   via an endpoint,       fallback string on any error
   never directly
```

Four things `AiService` must do, and they are the whole reason it is one module:

1. Cache on a hash of the input. During a demo the same quote is explained five
   times, and a cache hit is instant and free.
2. Time out at two seconds and return the fallback. A demo that hangs is worse than
   a demo without the feature.
3. Enforce structured output where shape B is used, so the caller gets a typed
   object or a rejection, never a paragraph it has to regex.
4. Log every call into `ai_invocations` (id, feature, inputHash, model, latencyMs,
   ok, createdAt). This is one small table and it is also a talking point: you can
   show a judge that model use is logged like everything else.

Environment:

```
GEMINI_API_KEY=            server only, never NEXT_PUBLIC_
AI_ENABLED=true
AI_MODEL=gemini-3.7-flash
AI_TIMEOUT_MS=2000
```

`AI_ENABLED=false` must produce a working application with plain fallback text
everywhere. Test that before the demo, because it is also your emergency switch.

Two calling patterns:

```
  BLOCKING (only when the user clicked a button and is waiting)
    request --> AiService --> response          budget: 2s hard timeout

  BACKGROUND (anything on a page load path)
    event --> BullMQ job --> AiService --> store on the row --> UI polls or shows
    the fallback until it arrives
```

Anything on the quotation builder path is background. That screen already
re-evaluates on every keystroke and cannot afford a network round trip.

## 4. Model choice, as of September 2026

Model names in this family change every few months, so check the provider docs
before you paste one in. At the time of writing, `gemini-3.7-flash` is the current
general-purpose Flash model and `gemini-3.5-flash-lite` is the cheap high-volume
option. The 2.0 models are already shut down and the 2.5 family has an announced
shutdown in October 2026, so do not build on either. Pro-tier models were removed
from the free tier earlier in 2026.

Free tier is roughly fifteen requests per minute and low four figures per day, which
is fine for a demo and not fine for a load test. Two consequences: cache
aggressively, and never put a model call inside a loop over quotation lines. One
call per quote, not one per line.

Structured output uses a `responseSchema` on the generate call, which is what makes
shape B safe. Ask for an object with a fixed set of keys and validate it with Zod on
the way out anyway, because a schema is a strong hint and not a guarantee.

The request is a plain HTTPS POST to `generativelanguage.googleapis.com` with the
key in an `x-goog-api-key` header, so no SDK is required. One `fetch` wrapper inside
`AiService` is enough, and it keeps the dependency list unchanged.

Note that newer models in this family deprecated the old sampling parameters and
replaced the thinking budget with a level setting, so copying a 2024-era snippet
will produce warnings or ignored fields.

## 5. Prospects by role

Effort assumes the deterministic feature it hangs off already works.

### F, frontend

| Idea | What the user sees | Effort | Fallback |
|---|---|---|---|
| Risk sentence on screens 4 and 6 | one line under the score explaining it in words | 20 min | the violations list, which already says it |
| Natural-language quote start | a box: "24 laptops and setup for Acme at 12%" produces a draft quote as a preview to confirm | 90 min | the normal builder |
| Draft reply to a customer message | rep clicks Suggest reply on screen 11's inbox, edits, sends | 45 min | empty textarea |
| Semantic product search | product picker matches "thing to plug a laptop into a monitor" | 60 min | substring search |

```
  NATURAL-LANGUAGE QUOTE - the safe wiring

  "24 laptops and setup for Acme, 12% off"
                |
                v
    POST /ai/quotes/draft         (B2 endpoint, shape B)
                |
                v
    { customerId, lines:[{productId, qty, discountBps}] }   ← validated, ids resolved
                |                                             against real products
                v
    F renders a PREVIEW CARD, not a quote
                |
         [ Apply ]  [ Discard ]
                |
                v
    the ordinary POST /quotes and POST /quotes/:id/lines run
    ordinary validation, ordinary evaluation, ordinary audit
```

The preview card is the whole trick. The model never creates a quote; it fills a
form that a human submits.

### B1, sales core

| Idea | Input | Output | Effort |
|---|---|---|---|
| Quote summary for the customer email or PDF | quote lines and totals | two-sentence plain summary | 25 min |
| Follow-up draft for a stalled deal | quote, age, last activity | short email a rep edits | 30 min |
| Customer record from a pasted signature | pasted text | proposed customer fields, confirmed by a human | 40 min |
| Duplicate customer detection | new name against existing | similarity flag before insert | 45 min |

The last two are shape B. Neither writes a row on its own.

### B2, intelligence and governance

This is where the strongest ideas live, because B2 already computes the facts a
model would otherwise be tempted to guess.

| Idea | Why it is safe | Effort |
|---|---|---|
| Risk explanation | takes the finished evaluation object and writes prose | 20 min |
| Approval briefing on screen 6 | summarises the audit trail and negotiation history so a manager sees what changed since the last approval | 40 min |
| Anomaly narration on the deal health screen | describes an already-detected anomaly | 25 min |
| Policy assistant in admin | admin types "services should be 12% for Gold", model returns a proposed `discount_policies` diff, admin confirms | 60 min |
| Upsell cold start with embeddings | seeded co-purchase data is thin, so rank by description similarity when history is missing | 75 min |

```
  RISK EXPLANATION - the shape to copy everywhere else

  evaluateQuote()  ->  { riskScore: 82, riskLevel: HIGH,
                         violations: [ Services 18% vs 10%, over 8pts ],
                         blended: { weightedExcessBps: 460, marginBps: 1140 } }
                              |
                              |  the decision is ALREADY MADE here
                              v
                       AiService.generateText(prompt + that JSON)
                              |
                              v
       "High risk because the services line is 8 points over its 10 percent
        ceiling, which pulls the deal margin below target."
                              |
                              v
                    displayed under the score, stored nowhere
```

The policy assistant is the most impressive of these to a judge, because it turns
English into configuration and then runs the same deterministic engine over it. Show
the proposed diff on screen before applying it, or it looks like magic instead of
governance.

### B3, commercial operations

| Idea | What it does | Effort |
|---|---|---|
| Negotiation intent extraction | customer free text to `{ quotationLineId, requestedDiscountBps }` | 45 min |
| Split explanation | one sentence on why the order needs two shipments | 20 min |
| Backorder notice draft | customer-facing message when stock is short | 25 min |
| Invoice line normalisation | tidy descriptions on the printed invoice | 20 min |

```
  NEGOTIATION INTENT - the highest-value item in this file

  customer types:
  "the warranty feels steep, can you do a bit better, maybe 15?"
                |
                v
        AiService.generateJson(schema)
                |
                v
  { quotationLineId: "line_4", requestedDiscountBps: 1500, confidence: 0.86 }
                |
                v
  saved on negotiation_messages as a PARSED HINT next to the raw text
                |
                v
  rep sees:  "Customer appears to be asking for 15% on Extended Warranty"
             [ Apply to line ]   [ Ignore ]
                |
                v
  ordinary line update -> ordinary re-evaluation -> ordinary re-approval
```

The schema already has `requestedDiscountBps` sitting next to `body`, so this needs
no migration. The raw text is always kept and always displayed. The parse is a
convenience, never the record.

## 6. If you have one spare hour, in this order

```
  1. Risk explanation            20 min   most visible, least risky
  2. Negotiation intent          45 min   makes the portal feel alive
  3. Approval briefing           40 min   managers see what changed
  4. Policy assistant            60 min   best story, most moving parts
  5. Everything else
```

Stop after whichever one is done when the clock hits the freeze. A half-wired model
call on the demo path is worse than none.

## 7. How to talk about it

Say the boundary out loud, because it is the strongest thing about the design:

> Every number that decides an outcome is computed in code we can test. The model
> reads the decision and explains it, or reads a sentence and fills in a form a
> human confirms. It never approves anything.

That answers the question a judge is going to ask anyway, and it turns a small
feature into evidence of judgement.

## 8. What not to do

```
  X  a model call inside the discount, risk, routing, tax or allocation path
  X  a model call per quotation line
  X  the API key anywhere the browser can reach it
  X  parsing prose back into a number that changes state
  X  a model call on the quotation builder's keystroke path
  X  building any of this before the deterministic chain works end to end
  X  a demo that breaks when AI_ENABLED is false
```

## 9. If not Gemini

The `AiService` interface is two methods, so the provider is a swap. Anthropic and
OpenAI both offer structured output and comparable small-model latency, and either
works with the same wrapper. A local model through Ollama removes the network and
the quota but adds a machine that must be running during the demo, which is a bad
trade on stage. Whichever you pick, keep the two-method interface and the fallback,
because that is what makes the choice reversible at hour twenty-two.
