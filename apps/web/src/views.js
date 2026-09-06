import { api } from './api.js'
import {
  esc, money, pct, when, ago, words, icon, badge, riskTone,
  pageHead, table, stat, linkCard, acc, counter, ask,
} from './ui.js'

// One function per screen. Each returns { html, mount?, chrome?, title? } and
// decides nothing: the ceilings, the score and the approval chain all arrive
// from the API already computed (Plan.md invariant 2).

const ORDER_NEXT = {
  CONFIRMED: ['FULFILLING', 'CANCELLED'],
  FULFILLING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

const sumMinor = (rows, pick) => rows.reduce((n, r) => n + (pick(r)?.amountMinor ?? 0), 0)
const asMoney = (amountMinor, currency = 'INR') => ({ amountMinor, currency })

/** Every mutating handler goes through this, so no screen swallows an error. */
const guard = (toast, fn, after) => async () => {
  try { const r = await fn(); await after?.(r) } catch (e) { toast(e.message, true) }
}

// ═══════════════════════════ Sign in ═══════════════════════════

export function loginView() {
  const demo = [
    ['rep', 'builds quotes'],
    ['manager', 'approval step 1'],
    ['finance', 'approval step 2'],
    ['ops', 'fulfilment'],
    ['admin', 'everything'],
  ]
  return {
    chrome: false,
    title: 'Sign in',
    html: `
      <div class="login-wrap">
        <!-- §2's oklab gradients never paint on the homepage; this panel is the
             surface it did not have. See styles.css for why --midnight, not --dusk. -->
        <div class="login-art">
          <span class="brand"><span class="brand-mark">${icon('bolt', 15)}</span><span>DealFlow360</span></span>
          <div>
            <p class="headline-l leading-trim">Quote to cash,<br>governed on the way through.</p>
            <p class="body-l" style="margin-top:24px;max-width:44ch;color:var(--text-hushedReverse)">
              A rep builds a quotation. The system reads its own discount policy, scores the
              risk, routes the approval and writes every step to an append-only log.
              Nobody is asked to remember a rule.
            </p>
          </div>
          <p class="body-xs" style="color:var(--text-hushedReverse)">Seeded demo · Acme Corp and Borealis Ltd · INR</p>
        </div>

        <div class="login-form">
          <div class="login-card stack" style="gap:32px">
            <div>
              <p class="eyebrow">Welcome back</p>
              <h1 class="headline-m leading-trim">Sign in</h1>
            </div>
            <form id="login" class="stack" style="gap:16px">
              <div class="field">
                <label class="label" for="email">Work email</label>
                <input id="email" name="email" type="email" autocomplete="username"
                  value="rep@dealflow.test" required>
              </div>
              <div class="field">
                <label class="label" for="password">Password</label>
                <input id="password" name="password" type="password" autocomplete="current-password"
                  value="password123" required>
              </div>
              <button class="btn btn-primary" type="submit" id="go">Sign in</button>
            </form>
            <div class="stack" style="gap:8px">
              <span class="label">Seeded accounts — every password is <code>password123</code></span>
              <div class="who">${demo.map(([r, what]) =>
                `<button type="button" data-who="${r}@dealflow.test" title="${esc(what)}">${r}</button>`).join('')}</div>
            </div>
          </div>
        </div>
      </div>`,
    mount(root, { toast }) {
      const email = root.querySelector('#email')
      root.querySelectorAll('[data-who]').forEach((b) =>
        b.addEventListener('click', () => { email.value = b.dataset.who; email.focus() }))

      root.querySelector('#login').addEventListener('submit', async (e) => {
        e.preventDefault()
        const btn = root.querySelector('#go')
        btn.disabled = true
        const f = new FormData(e.target)
        try {
          await api.login(f.get('email'), f.get('password'))
          location.hash = '#/'
        } catch (err) { toast(err.message, true); btn.disabled = false }
      })
    },
  }
}

// ═══════════════════════════ Overview ═══════════════════════════

export async function dashboardView() {
  const role = api.session.user?.role
  const [quotes, approvals, orders, health, audit] = await Promise.all([
    api.quotes({ pageSize: 100 }),
    api.approvals({ status: 'PENDING' }),
    api.orders({ pageSize: 100 }),
    api.dealHealth(),
    api.audit({ page: 1 }),
  ])

  const open = quotes.items.filter((q) => !['REJECTED', 'COMPLETED'].includes(q.status))
  const mine = approvals.items.filter((a) => a.currentStep === role)
  const currency = quotes.items[0]?.total?.currency ?? 'INR'

  // The ticker is the §0 "agent stat ticker" adapted: live counts off the API,
  // duplicated track, and the -50%-minus-half-a-gap offset in the keyframe.
  const ticks = [
    ['Quotations open', open.length],
    ['Awaiting approval', approvals.items.length],
    ['Orders raised', orders.items.length],
    ['Health signals', health.items.length],
    ['Audit entries', audit.total],
    ['Lines under policy', quotes.items.length],
  ]
  const tickItem = ([label, n]) =>
    `<span class="ticker-item"><span class="label hushed">${esc(label)}</span>
      <span class="body-xl tnum">${counter(n, `${label}: ${n}`)}</span></span>`

  const needsYou = mine.length
    ? mine.slice(0, 4).map((a) => `
        <a class="card card-white lift" href="#/approvals/${a.id}" style="display:block;text-decoration:none">
          <div class="card-link-title">
            <span class="body-l">Quote ${esc(a.quotationId.slice(-6))}</span>
            <span class="arrow hushed">${icon('arrow')}</span>
          </div>
          <div class="row" style="margin-top:12px">
            ${badge(a.currentStep, 'pending')}
            <span class="hushed body-xs">raised ${esc(ago(a.createdAt))}</span>
          </div>
        </a>`).join('')
    : `<div class="card span-all"><div class="empty">Nothing is waiting on you.</div></div>`

  return {
    title: 'Overview',
    html: `
      <div class="container">
        ${pageHead({
          eyebrow: `Signed in as ${words(role)}`,
          title: 'Overview',
          actions: `<a class="btn btn-primary" href="#/quotations">${icon('plus')} New quotation</a>`,
        })}

        <div class="ticker card card-dark" style="padding:20px 0">
          <div class="ticker-track">${[...ticks, ...ticks].map(tickItem).join('')}</div>
        </div>

        <div class="grid grid-4 spacer-t-m">
          ${stat('Open quotations', counter(open.length, `${open.length} open quotations`),
            'everything not rejected or completed')}
          ${stat('Waiting on you', counter(mine.length, `${mine.length} waiting on you`),
            mine.length ? 'your step is the pending one' : 'no step is assigned to your role')}
          ${stat('Pipeline', money(asMoney(sumMinor(open, (q) => q.total), currency)),
            'sum of open quotation totals')}
          ${stat('Health signals', counter(health.items.length, `${health.items.length} health signals`),
            'stalled, low margin, discount anomaly')}
        </div>

        <div class="grid split spacer-t-m">
          <div class="stack-l">
            <section>
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Needs a decision from you</h2>
                <a class="body-xs hushed" href="#/approvals">All approvals</a>
              </div>
              <div class="grid grid-2">${needsYou}</div>
            </section>

            <section>
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Recent quotations</h2>
                <a class="body-xs hushed" href="#/quotations">All quotations</a>
              </div>
              ${table(
                [{ label: 'Code' }, { label: 'Customer' }, { label: 'Status' },
                 { label: 'Total', num: true }, { label: 'Last activity' }],
                quotes.items.slice(0, 6).map((q) => `
                  <tr>
                    <td><a class="row-link" href="#/quotations/${q.id}">${esc(q.code)}</a></td>
                    <td>${esc(q.customer.name)} <span class="hushed body-xs">${esc(q.customer.tier)}</span></td>
                    <td>${badge(q.status)}</td>
                    <td class="num">${money(q.total)}</td>
                    <td class="hushed body-xs">${esc(ago(q.lastActivityAt))}</td>
                  </tr>`),
                'No quotations yet.',
              )}
            </section>
          </div>

          <div class="stack-l sticky-rail">
            <div class="card">
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Deal health</h2>
                <a class="body-xs hushed" href="#/deal-health">All signals</a>
              </div>
              ${health.items.length ? `<ul class="trail">${health.items.slice(0, 5).map((e) => `
                <li>
                  <span class="grow">
                    <a class="row-link" href="#/quotations/${e.quotationId}">${esc(words(e.type))}</a>
                    <div class="hushed body-xs">${esc(e.detail)}</div>
                  </span>
                  ${badge(e.severity, riskTone[e.severity])}
                </li>`).join('')}</ul>`
                : `<div class="empty">Nothing unhealthy right now.</div>`}
            </div>

            <div class="card card-white">
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Latest activity</h2>
                <span class="hushed body-xs">append only</span>
              </div>
              <ul class="trail">${audit.items.slice(0, 8).map((t) => `
                <li><time>${esc(when(t.createdAt))}</time>
                  <span class="grow">${esc(words(t.action))}
                    <span class="hushed body-xs">${esc(t.entityType)}</span></span></li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>`,
  }
}

// ═══════════════════════════ Quotations ═══════════════════════════

const QUOTE_STATUSES = ['DRAFT', 'SUBMITTED', 'PENDING_MANAGER', 'PENDING_FINANCE', 'APPROVED',
  'AUTO_APPROVED', 'RETURNED', 'REJECTED', 'CONFIRMED', 'NEGOTIATING', 'FULFILLING', 'COMPLETED']

export async function quotesView() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const status = params.get('status') ?? ''
  const customerId = params.get('customerId') ?? ''

  const [list, customers] = await Promise.all([
    api.quotes({ pageSize: 50, status, customerId }),
    api.customers({ pageSize: 100 }),
  ])

  return {
    title: 'Quotations',
    html: `
      <div class="container">
        ${pageHead({
          eyebrow: 'Sales',
          title: 'Quotations',
          actions: `<button class="btn btn-primary" id="new">${icon('plus')} New quotation</button>`,
        })}

        <div class="row" style="margin-bottom:24px">
          <div class="field" style="width:220px">
            <label class="label" for="f-status">Status</label>
            <select id="f-status">
              <option value="">Any status</option>
              ${QUOTE_STATUSES.map((s) =>
                `<option value="${s}"${s === status ? ' selected' : ''}>${esc(words(s))}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="width:260px">
            <label class="label" for="f-cus">Customer</label>
            <select id="f-cus">
              <option value="">Any customer</option>
              ${customers.items.map((c) =>
                `<option value="${c.id}"${c.id === customerId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <span class="hushed body-s" style="align-self:flex-end;padding-bottom:12px">
            ${list.total} quotation${list.total === 1 ? '' : 's'}</span>
        </div>

        ${table(
          [{ label: 'Code' }, { label: 'Customer' }, { label: 'Status' },
           { label: 'Total', num: true }, { label: 'Last activity' }],
          list.items.map((q) => `
            <tr class="clickable" data-href="#/quotations/${q.id}">
              <td><a class="row-link" href="#/quotations/${q.id}">${esc(q.code)}</a></td>
              <td>${esc(q.customer.name)} <span class="hushed body-xs">${esc(q.customer.tier)}</span></td>
              <td>${badge(q.status)}</td>
              <td class="num">${money(q.total)}</td>
              <td class="hushed body-xs">${esc(when(q.lastActivityAt))}</td>
            </tr>`),
          'No quotations match. Clear the filters, or create one to start the chain.',
        )}

        <dialog id="dlg" class="raised">
          <form method="dialog" class="stack" style="gap:20px">
            <h2 class="headline-xs leading-trim">New quotation</h2>
            <div class="field">
              <label class="label" for="cus">Customer</label>
              <select id="cus">${customers.items.map((c) =>
                `<option value="${c.id}" data-cur="${esc(c.currency)}">${esc(c.name)} — ${esc(c.tier?.code ?? '')}</option>`).join('')}</select>
            </div>
            <p class="body-xs hushed">The customer's tier picks the discount policy the quote is judged against.</p>
            <div class="row" style="justify-content:flex-end">
              <button class="btn" value="cancel">Cancel</button>
              <button class="btn btn-primary" value="create">Create</button>
            </div>
          </form>
        </dialog>
      </div>`,

    mount(root, { toast }) {
      root.querySelectorAll('tr[data-href]').forEach((tr) =>
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('a')) location.hash = tr.dataset.href
        }))

      const filter = () => {
        const p = new URLSearchParams()
        const s = root.querySelector('#f-status').value
        const c = root.querySelector('#f-cus').value
        if (s) p.set('status', s)
        if (c) p.set('customerId', c)
        location.hash = `#/quotations${p.toString() ? `?${p}` : ''}`
      }
      root.querySelector('#f-status').addEventListener('change', filter)
      root.querySelector('#f-cus').addEventListener('change', filter)

      const dlg = root.querySelector('#dlg')
      root.querySelector('#new').addEventListener('click', () => dlg.showModal())
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue !== 'create') return
        const opt = root.querySelector('#cus').selectedOptions[0]
        try {
          const quote = await api.createQuote(opt.value, opt.dataset.cur || 'INR')
          location.hash = `#/quotations/${quote.id}`
        } catch (e) { toast(e.message, true) }
      })
    },
  }
}

// ═══════════════════════════ Quote builder ═══════════════════════════

const lineCells = (l) => {
  const over = (l.overBps ?? 0) > 0
  return {
    ceiling: over
      ? `<span class="badge badge-over">OVER ${pct(l.overBps)}</span>
         <div class="hushed body-xs" style="margin-top:4px">ceiling ${pct(l.allowedDiscountBps)}</div>`
      : `<span class="hushed body-xs">within ${l.allowedDiscountBps != null ? pct(l.allowedDiscountBps) : 'ceiling'}</span>`,
    total: money(l.lineTotal),
    over,
  }
}

export async function quoteView(id) {
  const [quote, products, upsell, health] = await Promise.all([
    api.quote(id),
    api.products(),
    api.upsell(id).catch(() => ({ items: [] })),
    api.dealHealth(id).catch(() => ({ items: [] })),
  ])
  const editable = quote.status === 'DRAFT' || quote.status === 'RETURNED'
  const confirmable = quote.status === 'APPROVED' || quote.status === 'AUTO_APPROVED'
  const ev = quote.evaluation

  const lineRow = (l) => {
    const c = lineCells(l)
    return `
      <tr data-line="${l.id}">
        <td>
          <div>${esc(l.description)}</div>
          <div class="hushed body-xs">${l.lineType === 'RECURRING' ? 'Recurring' : 'One time'} · ${money(l.unitPrice)} each</div>
        </td>
        <td class="num">${editable
          ? `<input class="input-inline" type="number" min="1" value="${l.qty}" data-field="qty"
               aria-label="Quantity for ${esc(l.description)}">`
          : l.qty}</td>
        <td class="num">${editable
          ? `<input class="input-inline${c.over ? ' over' : ''}" type="number" min="0" max="10000" step="50"
               value="${l.discountBps}" data-field="discountBps"
               aria-label="Discount in basis points for ${esc(l.description)}">`
          : pct(l.discountBps)}</td>
        <td data-cell="ceiling">${c.ceiling}</td>
        <td class="num" data-cell="total">${c.total}</td>
        <td class="num">${editable
          ? `<button class="btn-icon" data-remove="${l.id}" aria-label="Remove ${esc(l.description)}">${icon('close', 15)}</button>`
          : ''}</td>
      </tr>`
  }

  const riskPanel = (ev, approval) => !ev
    ? `<p class="body-s hushed">Add a line to see the score.</p>`
    : `<div class="headline-m leading-trim tnum">${ev.riskScore}<span class="body-m hushed"> / 100</span></div>
       <div class="meter ${esc(ev.riskLevel.toLowerCase())}"><i style="width:${ev.riskScore}%"></i></div>
       <p class="body-s" style="margin-top:16px">${ev.approvalRequired
         ? 'Approval is required. The numbers decided that, nobody asked for it.'
         : 'Inside every ceiling. This can be confirmed without an approval.'}</p>
       ${approval ? `<p class="body-s hushed" style="margin-top:8px">Waiting on ${esc(words(approval.currentStep))}</p>` : ''}`

  return {
    title: quote.code,
    html: `
      <div class="container">
        ${pageHead({
          crumb: `<a href="#/quotations">Quotations</a> / ${esc(quote.code)}`,
          title: quote.customer.name,
          actions: `
            ${editable ? `<button class="btn btn-primary" id="submit" ${quote.lines.length ? '' : 'disabled'}>
              Submit for review</button>` : ''}
            ${confirmable ? `<button class="btn btn-primary" id="confirm">Confirm and create order</button>` : ''}
            ${quote.status === 'CONFIRMED' ? `<a class="btn btn-quiet" href="#/orders">View orders ${icon('arrow')}</a>` : ''}`,
        })}
        <div class="row" style="margin:-12px 0 24px" id="statusrow">
          ${badge(quote.status)}
          <span class="badge badge-outline">${esc(quote.customer.tier)} tier</span>
          <span class="badge badge-outline">margin ${pct(quote.marginBps)}</span>
        </div>

        <div class="grid split">
          <div class="stack-l">
            ${table(
              [{ label: 'Line' }, { label: 'Qty', num: true }, { label: 'Discount', num: true },
               { label: 'Against the ceiling' }, { label: 'Total', num: true }, { label: '' }],
              quote.lines.map(lineRow),
              'No lines yet. Add a product below.',
            ).replace('<tbody>', '<tbody id="lines">')}

            ${editable ? `
            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Add a line</h2></div>
              <form id="addline" class="row" style="align-items:flex-end">
                <div class="field grow" style="min-width:240px">
                  <label class="label" for="prod">Product</label>
                  <select id="prod" name="productId">${products.items.map((p) =>
                    `<option value="${p.id}">${esc(p.name)} — ${esc(p.category.name)} · ${money(p.listPrice)}</option>`).join('')}</select>
                </div>
                <div class="field" style="width:100px">
                  <label class="label" for="qty">Qty</label>
                  <input id="qty" name="qty" type="number" min="1" value="1">
                </div>
                <div class="field" style="width:130px">
                  <label class="label" for="disc">Discount %</label>
                  <input id="disc" name="discount" type="number" min="0" max="100" step="0.5" value="0">
                </div>
                <button class="btn btn-primary" type="submit">Add</button>
              </form>
            </div>` : ''}

            ${upsell.items.length ? `
            <section>
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Suggested</h2>
                <span class="hushed body-xs">ranked against what is already on the quote</span>
              </div>
              <div class="grid grid-2">${upsell.items.slice(0, 4).map((u) => `
                <div class="card card-white">
                  <div class="row-between" style="gap:12px;align-items:flex-start">
                    <div class="grow">
                      <div>${esc(u.name)}</div>
                      <div class="hushed body-xs" style="margin-top:4px">${esc(u.reason)}</div>
                    </div>
                    <div class="right">
                      <div class="tnum">${money(u.unitPrice)}</div>
                      ${editable ? `<button class="btn btn-sm" data-upsell="${u.productId}"
                        style="margin-top:8px">Add</button>` : ''}
                    </div>
                  </div>
                </div>`).join('')}</div>
            </section>` : ''}

            <div class="card card-white">
              ${acc('Evaluation history — every re-score, newest first',
                `<div id="evbody" class="body-s hushed">Loading…</div>`)}
              ${acc(`Health signals on this quote (${health.items.length})`,
                health.items.length
                  ? `<ul class="trail">${health.items.map((e) => `
                      <li><span class="grow">${esc(words(e.type))}
                        <div class="hushed body-xs">${esc(e.detail)}</div></span>
                        ${badge(e.severity, riskTone[e.severity])}</li>`).join('')}</ul>`
                  : `<p class="body-s hushed">No signals against this quote.</p>`)}
            </div>
          </div>

          <div class="stack-l sticky-rail">
            <div class="card ${ev?.approvalRequired ? 'card-dark' : ''}" id="riskcard">
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Risk</h2>
                ${ev ? badge(ev.riskLevel, riskTone[ev.riskLevel]) : ''}
              </div>
              <div id="riskbody">${riskPanel(ev, quote.approval)}</div>
            </div>

            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Totals</h2></div>
              <div class="stack" style="gap:8px" id="totals">
                <div class="row-between"><span class="hushed body-s">Subtotal</span><span class="tnum">${money(quote.totals.subtotal)}</span></div>
                <div class="row-between"><span class="hushed body-s">Discount</span><span class="tnum">−${money(quote.totals.discount)}</span></div>
                <div class="row-between"><span class="hushed body-s">Tax</span><span class="tnum">${money(quote.totals.tax)}</span></div>
                <div class="row-between" style="border-top:1px solid var(--border-primary);padding-top:12px;margin-top:4px">
                  <span>Total</span><span class="headline-xs leading-trim tnum">${money(quote.totals.total)}</span>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Valid until</h2></div>
              <input type="date" id="validuntil" ${editable ? '' : 'disabled'}
                value="${quote.validUntil ? quote.validUntil.slice(0, 10) : ''}"
                aria-label="Quotation valid until">
              <p class="body-xs hushed" style="margin-top:12px">Saved as soon as you pick a date.</p>
            </div>

            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Customer portal</h2></div>
              <p class="body-s hushed">What the customer sees. No score, no margin, no other customer —
                enforced on the server, not by hiding it here.</p>
              ${quote.portalToken ? `
                <div class="row" style="margin-top:12px">
                  <a class="btn btn-sm" href="#/portal/${quote.portalToken}" target="_blank" rel="noopener noreferrer">
                    Open portal view ${icon('arrow', 14)}</a>
                  <button class="btn btn-sm btn-quiet" id="copy">Copy link</button>
                </div>`
                : `<p class="body-s hushed" style="margin-top:12px">No portal link on this quote.</p>`}
            </div>
          </div>
        </div>
      </div>`,

    async mount(root, { toast, reload }) {
      // Patching a line must not re-render the page: an input that loses focus
      // mid-typing is the fastest way to make a builder feel broken. So the
      // write goes out, the fresh quote comes back, and only the cells that
      // actually changed are rewritten.
      const refresh = async () => {
        const q = await api.quote(id)
        for (const l of q.lines) {
          const tr = root.querySelector(`[data-line="${l.id}"]`)
          if (!tr) continue
          const c = lineCells(l)
          tr.querySelector('[data-cell="ceiling"]').innerHTML = c.ceiling
          tr.querySelector('[data-cell="total"]').textContent = c.total
          tr.querySelector('[data-field="discountBps"]')?.classList.toggle('over', c.over)
        }
        root.querySelector('#totals').innerHTML = `
          <div class="row-between"><span class="hushed body-s">Subtotal</span><span class="tnum">${money(q.totals.subtotal)}</span></div>
          <div class="row-between"><span class="hushed body-s">Discount</span><span class="tnum">−${money(q.totals.discount)}</span></div>
          <div class="row-between"><span class="hushed body-s">Tax</span><span class="tnum">${money(q.totals.tax)}</span></div>
          <div class="row-between" style="border-top:1px solid var(--border-primary);padding-top:12px;margin-top:4px">
            <span>Total</span><span class="headline-xs leading-trim tnum">${money(q.totals.total)}</span></div>`
        root.querySelector('#riskbody').innerHTML = riskPanel(q.evaluation, q.approval)
        root.querySelector('#riskcard').classList.toggle('card-dark', !!q.evaluation?.approvalRequired)
        const head = root.querySelector('#riskcard .card-head')
        head.querySelector('.badge')?.remove()
        if (q.evaluation) head.insertAdjacentHTML('beforeend', badge(q.evaluation.riskLevel, riskTone[q.evaluation.riskLevel]))
        const submit = root.querySelector('#submit')
        if (submit) submit.disabled = q.lines.length === 0
      }

      root.querySelector('#addline')?.addEventListener('submit', (e) => {
        e.preventDefault()
        const f = new FormData(e.target)
        guard(toast, () => api.addLine(id, {
          productId: f.get('productId'),
          qty: Number(f.get('qty')),
          // percent is a label; basis points are the wire format
          discountBps: Math.round(Number(f.get('discount')) * 100),
        }), reload)()
      })

      root.querySelectorAll('#lines input').forEach((input) => {
        input.addEventListener('change', guard(toast,
          () => api.updateLine(id, input.closest('[data-line]').dataset.line,
            { [input.dataset.field]: Number(input.value) }),
          refresh))
      })

      root.querySelectorAll('[data-remove]').forEach((b) =>
        b.addEventListener('click', guard(toast, () => api.removeLine(id, b.dataset.remove), reload)))

      root.querySelectorAll('[data-upsell]').forEach((b) =>
        b.addEventListener('click', guard(toast,
          () => api.addLine(id, { productId: b.dataset.upsell, qty: 1, discountBps: 0 }), reload)))

      root.querySelector('#validuntil')?.addEventListener('change', (e) => {
        const picked = new Date(e.target.value)
        if (Number.isNaN(picked.valueOf())) return   // the field was cleared
        guard(toast, () => api.updateQuote(id, { validUntil: picked.toISOString() }),
          () => toast('Valid-until date saved.'))()
      })

      root.querySelector('#submit')?.addEventListener('click', guard(toast,
        () => api.submit(id),
        (after) => {
          toast(after.status === 'PENDING_MANAGER'
            ? 'Over a ceiling — the quote routed itself to the sales manager.'
            : after.status === 'PENDING_FINANCE'
              ? 'Over the finance threshold — routed to finance.'
              : 'Inside every ceiling: auto approved.')
          reload()
        }))

      root.querySelector('#confirm')?.addEventListener('click', guard(toast,
        () => api.confirm(id),
        (res) => { toast(`Order ${res.orderCode ?? ''} created from this quote.`); reload() }))

      root.querySelector('#copy')?.addEventListener('click', async () => {
        const url = `${location.origin}/#/portal/${quote.portalToken}`
        try { await navigator.clipboard.writeText(url); toast('Portal link copied.') }
        catch { toast(url) }
      })

      // The history is a second round trip, so it loads into the open accordion
      // rather than holding up the whole screen.
      const evbody = root.querySelector('#evbody')
      try {
        const history = await api.evaluations(id)
        evbody.outerHTML = history.length
          ? `<ul class="trail" id="evbody">${history.map((h) => `
              <li><time>${esc(when(h.createdAt))}</time>
                <span class="grow">score ${h.riskScore} · ${esc(h.riskLevel)}
                  <span class="hushed">worst line ${pct(h.worstLineExcessBps)} over,
                  weighted ${pct(h.weightedExcessBps)} over</span></span>
                ${h.approvalRequired ? badge('needs approval', 'pending') : badge('clean', 'ok')}</li>`).join('')}</ul>`
          : `<p class="body-s hushed" id="evbody">No evaluation has run yet. Submitting scores the quote.</p>`
      } catch { evbody.textContent = 'Could not load the history.' }
    },
  }
}

// ═══════════════════════════ Approvals ═══════════════════════════

export async function approvalsView() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const status = params.get('status') ?? 'PENDING'
  const role = api.session.user?.role
  const { items } = await api.approvals({ status })

  const stepChip = (s) =>
    `<span class="badge badge-${s.status === 'APPROVED' ? 'ok' : s.status === 'PENDING' ? 'pending' : 'over'}">${esc(words(s.role))}</span>`

  return {
    title: 'Approvals',
    html: `
      <div class="container">
        ${pageHead({ eyebrow: 'Governance', title: 'Approvals' })}

        <div class="row" style="margin-bottom:24px">
          <div class="field" style="width:220px">
            <label class="label" for="f-status">Status</label>
            <select id="f-status">${['PENDING', 'APPROVED', 'REJECTED', 'RETURNED'].map((s) =>
              `<option value="${s}"${s === status ? ' selected' : ''}>${esc(words(s))}</option>`).join('')}</select>
          </div>
          <span class="hushed body-s" style="align-self:flex-end;padding-bottom:12px">
            A step can only be decided by the role it is assigned to.</span>
        </div>

        ${table(
          [{ label: 'Quote' }, { label: 'Request' }, { label: 'Chain' }, { label: 'Waiting on' }, { label: 'Raised' }],
          items.map((a) => `
            <tr class="clickable" data-href="#/approvals/${a.id}">
              <td><a class="row-link" href="#/quotations/${a.quotationId}">${esc(a.quotationId.slice(-6))}</a></td>
              <td>${badge(a.status)}</td>
              <td>${a.steps.map(stepChip).join(' ')}</td>
              <td>${a.currentStep
                ? (a.currentStep === role
                  ? `<span class="badge badge-pending">you</span>`
                  : `<span class="hushed body-xs">${esc(words(a.currentStep))}</span>`)
                : `<span class="hushed body-xs">—</span>`}</td>
              <td class="hushed body-xs">${esc(when(a.createdAt))}</td>
            </tr>`),
          'Nothing here. Submit an over-ceiling quote and it lands in this queue by itself.',
        )}
      </div>`,
    mount(root) {
      root.querySelector('#f-status').addEventListener('change', (e) => {
        location.hash = `#/approvals?status=${e.target.value}`
      })
      root.querySelectorAll('tr[data-href]').forEach((tr) =>
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('a')) location.hash = tr.dataset.href
        }))
    },
  }
}

export async function approvalView(id) {
  const { request, evaluation, trail } = await api.approval(id)
  const violations = evaluation?.violations ?? []
  const mine = request.currentStep === api.session.user?.role
  const pending = request.status === 'PENDING'

  return {
    title: 'Approval',
    html: `
      <div class="container">
        ${pageHead({
          crumb: `<a href="#/approvals">Approvals</a> / ${esc(request.quotationId.slice(-6))}`,
          title: 'Why this was flagged',
          actions: pending ? `
            <button class="btn btn-quiet" id="return">Return</button>
            <button class="btn btn-danger" id="reject">Reject</button>
            <button class="btn btn-primary" id="approve" ${mine ? '' : 'disabled'}>
              ${mine ? 'Approve' : `Waiting on ${esc(words(request.currentStep))}`}</button>`
            : badge(request.status),
        })}

        <div class="grid split">
          <div class="stack-l">
            ${table(
              [{ label: 'Line' }, { label: 'Given', num: true }, { label: 'Allowed', num: true }, { label: 'Over by', num: true }],
              violations.map((v) => `
                <tr>
                  <td>${esc(v.categoryName)}<div class="hushed body-xs">line ${esc(v.quoteLineId.slice(-6))}</div></td>
                  <td class="num">${pct(v.actualBps)}</td>
                  <td class="num">${pct(v.allowedBps)}</td>
                  <td class="num"><span class="badge badge-over">${pct(v.excessBps)}</span></td>
                </tr>`),
              'No single line broke its ceiling — the blended total is what crossed the threshold.',
            )}

            <div class="card">
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Audit trail</h2>
                <span class="hushed body-xs">append only, written in the same transaction as the transition</span>
              </div>
              <ul class="trail">${trail.map((t) => `
                <li><time>${esc(when(t.createdAt))}</time>
                  <span class="grow">${esc(words(t.action))}
                    ${t.fromValue
                      ? `<span class="hushed">${esc(words(t.fromValue))} → ${esc(words(t.toValue))}</span>`
                      : t.toValue ? `<span class="hushed">${esc(words(t.toValue))}</span>` : ''}</span></li>`).join('')}
              </ul>
            </div>
          </div>

          <div class="stack-l sticky-rail">
            <div class="card card-dark">
              <div class="card-head">
                <h2 class="headline-xs leading-trim">Blended score</h2>
                ${badge(evaluation?.riskLevel ?? '—', riskTone[evaluation?.riskLevel])}
              </div>
              <div class="headline-m leading-trim tnum">${evaluation?.riskScore ?? '—'}<span class="body-m hushed"> / 100</span></div>
              <div class="meter ${esc((evaluation?.riskLevel ?? '').toLowerCase())}">
                <i style="width:${evaluation?.riskScore ?? 0}%"></i></div>
              <div class="stack" style="gap:8px;margin-top:20px">
                <div class="row-between"><span class="hushed body-s">Worst line over by</span><span class="tnum">${pct(evaluation?.worstLineExcessBps)}</span></div>
                <div class="row-between"><span class="hushed body-s">Weighted over by</span><span class="tnum">${pct(evaluation?.weightedExcessBps)}</span></div>
                <div class="row-between"><span class="hushed body-s">Margin</span><span class="tnum">${pct(evaluation?.marginBps)}</span></div>
              </div>
              <p class="body-xs" style="margin-top:20px;color:var(--text-hushedReverse)">
                The score is presentation. The chain below came straight off the policy
                thresholds, not off this number.</p>
            </div>

            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Chain</h2></div>
              <ul class="trail">${request.steps.map((s) => `
                <li><span class="grow">${esc(words(s.role))}</span>
                  <span class="badge badge-${s.status === 'APPROVED' ? 'ok' : s.status === 'PENDING' ? 'pending' : 'over'}">${esc(s.status)}</span>
                </li>`).join('')}</ul>
              <a class="btn btn-sm btn-quiet" href="#/quotations/${request.quotationId}"
                style="margin-top:16px">Open the quotation ${icon('arrow', 14)}</a>
            </div>
          </div>
        </div>
      </div>`,

    mount(root, { toast, reload }) {
      const decide = (action, opts) => async () => {
        let reason
        if (action !== 'approve') {
          reason = await ask(`${action === 'reject' ? 'Reject' : 'Return'} this quotation?`, opts)
          if (reason === null) return
        }
        try {
          const res = await api.decide(id, action, reason)
          toast(`Recorded. The quotation is now ${words(res.quoteStatus)}.`)
          reload()
        } catch (e) { toast(e.message, true) }
      }
      root.querySelector('#approve')?.addEventListener('click', decide('approve'))
      root.querySelector('#reject')?.addEventListener('click',
        decide('reject', { confirmLabel: 'Reject', danger: true, placeholder: 'Discount cannot be justified at this margin.' }))
      root.querySelector('#return')?.addEventListener('click',
        decide('return', { confirmLabel: 'Return to the rep', placeholder: 'Bring the services line under 10% and resubmit.' }))
    },
  }
}

// ═══════════════════════════ Orders ═══════════════════════════

export async function ordersView() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const status = params.get('status') ?? ''
  const { items, total } = await api.orders({ pageSize: 50, status })

  return {
    title: 'Orders',
    html: `
      <div class="container">
        ${pageHead({ eyebrow: 'Operations', title: 'Orders' })}

        <div class="row" style="margin-bottom:24px">
          <div class="field" style="width:220px">
            <label class="label" for="f-status">Status</label>
            <select id="f-status">
              <option value="">Any status</option>
              ${['CONFIRMED', 'FULFILLING', 'COMPLETED', 'CANCELLED'].map((s) =>
                `<option value="${s}"${s === status ? ' selected' : ''}>${esc(words(s))}</option>`).join('')}
            </select>
          </div>
          <span class="hushed body-s" style="align-self:flex-end;padding-bottom:12px">${total} order${total === 1 ? '' : 's'}</span>
        </div>

        ${table(
          [{ label: 'Order' }, { label: 'Customer' }, { label: 'Status' }, { label: 'Raised' }, { label: 'Total', num: true }],
          items.map((o) => `
            <tr class="clickable" data-href="#/orders/${o.id}">
              <td><a class="row-link" href="#/orders/${o.id}">${esc(o.code)}</a></td>
              <td>${esc(o.customer?.name ?? '—')}</td>
              <td>${badge(o.status)}</td>
              <td class="hushed body-xs">${esc(when(o.createdAt))}</td>
              <td class="num">${money(o.total ?? o.totals?.total)}</td>
            </tr>`),
          'No orders yet. Confirm an approved quotation and one appears here.',
        )}
      </div>`,
    mount(root) {
      root.querySelector('#f-status').addEventListener('change', (e) => {
        location.hash = `#/orders${e.target.value ? `?status=${e.target.value}` : ''}`
      })
      root.querySelectorAll('tr[data-href]').forEach((tr) =>
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('a')) location.hash = tr.dataset.href
        }))
    },
  }
}

export async function orderView(id) {
  const order = await api.order(id)
  // Fulfilment is OPS's job, and the API refuses anyone else. The buttons follow
  // the same transition table the server enforces, so a dead end shows as no button.
  const canMove = api.session.can('OPS', 'ADMIN')
  const next = ORDER_NEXT[order.status] ?? []

  return {
    title: order.code,
    html: `
      <div class="container">
        ${pageHead({
          crumb: `<a href="#/orders">Orders</a> / ${esc(order.code)}`,
          title: order.customer?.name ?? order.code,
          actions: canMove
            ? next.map((s) => `<button class="btn ${s === 'CANCELLED' ? 'btn-danger' : 'btn-primary'}"
                data-to="${s}">Mark ${esc(words(s))}</button>`).join('')
            : `<span class="hushed body-s">Only ops can advance fulfilment.</span>`,
        })}
        <div class="row" style="margin:-12px 0 24px">
          ${badge(order.status)}
          <span class="badge badge-outline">${esc(order.code)}</span>
          <a class="badge badge-outline" href="#/quotations/${order.quotationId}"
            style="text-decoration:none">from the quotation ${icon('arrow', 12)}</a>
        </div>

        <div class="grid split">
          ${table(
            [{ label: 'Line' }, { label: 'Qty', num: true }, { label: 'Unit', num: true }, { label: 'Total', num: true }],
            order.lines.map((l) => `
              <tr>
                <td>${esc(l.description)}
                  <div class="hushed body-xs">${l.lineType === 'RECURRING' ? 'Recurring' : 'One time'}</div></td>
                <td class="num">${l.qty}</td>
                <td class="num">${money(l.unitPrice)}</td>
                <td class="num">${money(l.lineTotal)}</td>
              </tr>`),
            'This order has no lines.',
          )}

          <div class="stack-l">
            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Totals</h2></div>
              <div class="stack" style="gap:8px">
                <div class="row-between"><span class="hushed body-s">Subtotal</span><span class="tnum">${money(order.totals.subtotal)}</span></div>
                <div class="row-between"><span class="hushed body-s">Discount</span><span class="tnum">−${money(order.totals.discount)}</span></div>
                <div class="row-between"><span class="hushed body-s">Tax</span><span class="tnum">${money(order.totals.tax)}</span></div>
                <div class="row-between" style="border-top:1px solid var(--border-primary);padding-top:12px;margin-top:4px">
                  <span>Total</span><span class="headline-xs leading-trim tnum">${money(order.totals.total)}</span></div>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Fulfilment</h2></div>
              <p class="body-s hushed">Confirmed goes to fulfilling or cancelled; fulfilling goes to
                completed or cancelled. The quotation follows its order, and only the state
                service writes either status.</p>
            </div>
          </div>
        </div>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelectorAll('[data-to]').forEach((b) =>
        b.addEventListener('click', guard(toast,
          () => api.setOrderStatus(id, b.dataset.to),
          () => { toast(`Order is now ${words(b.dataset.to)}.`); reload() })))
    },
  }
}

// ═══════════════════════════ Customers ═══════════════════════════

export async function customersView() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const q = params.get('q') ?? ''
  const [list, tiers] = await Promise.all([api.customers({ pageSize: 50, q }), api.tiers()])

  return {
    title: 'Customers',
    html: `
      <div class="container">
        ${pageHead({
          eyebrow: 'Sales',
          title: 'Customers',
          actions: api.session.can('ADMIN', 'SALES_REP', 'SALES_MANAGER')
            ? `<button class="btn btn-primary" id="new">${icon('plus')} New customer</button>` : '',
        })}

        <div class="row" style="margin-bottom:24px">
          <div class="field" style="width:300px">
            <label class="label" for="q">Search</label>
            <input id="q" type="search" value="${esc(q)}" placeholder="Name or code">
          </div>
        </div>

        ${table(
          [{ label: 'Customer' }, { label: 'Code' }, { label: 'Tier' }, { label: 'Currency' }, { label: 'Email' }],
          list.items.map((c) => `
            <tr class="clickable" data-href="#/customers/${c.id}">
              <td><a class="row-link" href="#/customers/${c.id}">${esc(c.name)}</a></td>
              <td class="hushed body-xs">${esc(c.code)}</td>
              <td><span class="badge badge-outline">${esc(c.tier?.code ?? '—')}</span></td>
              <td>${esc(c.currency)}</td>
              <td class="hushed body-xs">${esc(c.email ?? '—')}</td>
            </tr>`),
          'No customers match that search.',
        )}

        <dialog id="dlg" class="raised">
          <form method="dialog" class="stack" style="gap:20px">
            <h2 class="headline-xs leading-trim">New customer</h2>
            <div class="field"><label class="label" for="c-name">Name</label>
              <input id="c-name" required></div>
            <div class="field"><label class="label" for="c-tier">Tier</label>
              <select id="c-tier">${tiers.map((t) =>
                `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
            <div class="row" style="gap:12px">
              <div class="field grow"><label class="label" for="c-cur">Currency</label>
                <input id="c-cur" value="INR" maxlength="3"></div>
              <div class="field grow"><label class="label" for="c-email">Email</label>
                <input id="c-email" type="email"></div>
            </div>
            <p class="body-xs hushed">The tier decides which discount ceilings every quote for
              this customer is judged against.</p>
            <div class="row" style="justify-content:flex-end">
              <button class="btn" value="cancel">Cancel</button>
              <button class="btn btn-primary" value="create">Create</button>
            </div>
          </form>
        </dialog>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelectorAll('tr[data-href]').forEach((tr) =>
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('a')) location.hash = tr.dataset.href
        }))
      root.querySelector('#q').addEventListener('change', (e) => {
        location.hash = `#/customers${e.target.value ? `?q=${encodeURIComponent(e.target.value)}` : ''}`
      })

      const dlg = root.querySelector('#dlg')
      root.querySelector('#new')?.addEventListener('click', () => dlg.showModal())
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue !== 'create') return
        try {
          await api.createCustomer({
            name: root.querySelector('#c-name').value.trim(),
            tierId: root.querySelector('#c-tier').value,
            currency: root.querySelector('#c-cur').value.trim().toUpperCase(),
            email: root.querySelector('#c-email').value.trim() || undefined,
          })
          toast('Customer created.')
          reload()
        } catch (e) { toast(e.message, true) }
      })
    },
  }
}

export async function customerView(id) {
  const [customer, quotes, tiers] = await Promise.all([
    api.customer(id),
    api.quotes({ customerId: id, pageSize: 50 }),
    api.tiers(),
  ])
  const editable = api.session.can('ADMIN', 'SALES_REP', 'SALES_MANAGER')
  const open = quotes.items.filter((q) => !['REJECTED', 'COMPLETED'].includes(q.status))

  return {
    title: customer.name,
    html: `
      <div class="container">
        ${pageHead({
          crumb: `<a href="#/customers">Customers</a> / ${esc(customer.code)}`,
          title: customer.name,
          actions: `<a class="btn btn-quiet" href="#/quotations?customerId=${id}">Their quotations ${icon('arrow', 14)}</a>`,
        })}

        <div class="grid split">
          <div class="stack-l">
            ${table(
              [{ label: 'Code' }, { label: 'Status' }, { label: 'Total', num: true }, { label: 'Last activity' }],
              quotes.items.map((q) => `
                <tr class="clickable" data-href="#/quotations/${q.id}">
                  <td><a class="row-link" href="#/quotations/${q.id}">${esc(q.code)}</a></td>
                  <td>${badge(q.status)}</td>
                  <td class="num">${money(q.total)}</td>
                  <td class="hushed body-xs">${esc(when(q.lastActivityAt))}</td>
                </tr>`),
              'No quotations for this customer yet.',
            )}
          </div>

          <div class="stack-l">
            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Account</h2></div>
              <div class="stack" style="gap:16px">
                <div class="field">
                  <label class="label" for="tier">Tier</label>
                  <select id="tier" ${editable ? '' : 'disabled'}>${tiers.map((t) =>
                    `<option value="${t.id}"${t.id === customer.tierId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
                </div>
                <div class="row-between"><span class="hushed body-s">Code</span><span>${esc(customer.code)}</span></div>
                <div class="row-between"><span class="hushed body-s">Currency</span><span>${esc(customer.currency)}</span></div>
                <div class="row-between"><span class="hushed body-s">Email</span><span>${esc(customer.email ?? '—')}</span></div>
                <div class="row-between"><span class="hushed body-s">Owner</span><span>${esc(customer.owner?.name ?? '—')}</span></div>
              </div>
              <p class="body-xs hushed" style="margin-top:16px">Changing the tier changes which
                ceilings future evaluations use.</p>
            </div>
            <div class="grid grid-2">
              ${stat('Open quotations', counter(open.length, `${open.length} open quotations`))}
              ${stat('Pipeline', money({
                amountMinor: sumMinor(open, (q) => q.total),
                currency: customer.currency,
              }))}
            </div>
          </div>
        </div>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelectorAll('tr[data-href]').forEach((tr) =>
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('a')) location.hash = tr.dataset.href
        }))
      root.querySelector('#tier')?.addEventListener('change', (e) =>
        guard(toast, () => api.updateCustomer(id, { tierId: e.target.value }),
          () => { toast('Tier updated.'); reload() })())
    },
  }
}

// ═══════════════════════════ Catalog ═══════════════════════════

export async function catalogView() {
  const [products, categories, warehouses] = await Promise.all([
    api.products(), api.categories(), api.warehouses(),
  ])

  return {
    title: 'Catalog',
    html: `
      <div class="container">
        ${pageHead({ eyebrow: 'Operations', title: 'Catalog' })}

        <div class="row" style="margin-bottom:24px">
          ${categories.items.map((c) => `<span class="badge badge-outline">${esc(c.name)}</span>`).join('')}
          <span class="hushed body-s">${products.items.length} products across ${categories.items.length} categories</span>
        </div>

        ${table(
          [{ label: 'SKU' }, { label: 'Product' }, { label: 'Category' }, { label: 'Billing' }, { label: 'List price', num: true }],
          products.items.map((p) => `
            <tr>
              <td class="hushed body-xs">${esc(p.sku)}</td>
              <td>${esc(p.name)}</td>
              <td><span class="badge badge-outline">${esc(p.category.name)}</span></td>
              <td class="hushed body-xs">${p.lineType === 'RECURRING'
                ? `every ${p.billingIntervalMonths ?? 1} month${p.billingIntervalMonths === 1 ? '' : 's'}`
                : 'one time'}</td>
              <td class="num">${money(p.listPrice)}</td>
            </tr>`),
          'The catalog is empty. Run npm run seed.',
        )}

        <h2 class="headline-xs leading-trim spacer-t-m" style="margin-bottom:16px">Stock by warehouse</h2>
        <div class="grid grid-3">
          ${warehouses.items.map((w) => `
            <div class="card">
              <div class="card-head">
                <h3 class="body-l">${esc(w.name)}</h3>
                <span class="badge badge-outline">${esc(w.code)}</span>
              </div>
              <table>
                <thead><tr><th>Product</th><th class="num">Free</th><th class="num">Held</th></tr></thead>
                <tbody>${w.stock.length ? w.stock.map((s) => `
                  <tr>
                    <td class="body-s">${esc(s.productName)}</td>
                    <td class="num">${s.onHand - s.reserved}</td>
                    <td class="num hushed">${s.reserved}</td>
                  </tr>`).join('')
                  : `<tr><td colspan="3"><div class="empty">Nothing stocked here.</div></td></tr>`}
                </tbody>
              </table>
            </div>`).join('')}
        </div>
      </div>`,
  }
}

// ═══════════════════════════ Deal health ═══════════════════════════

export async function healthView() {
  const { items } = await api.dealHealth()

  return {
    title: 'Deal health',
    html: `
      <div class="container">
        ${pageHead({
          eyebrow: 'Signals',
          title: 'Deal health',
          actions: `<button class="btn btn-primary" id="scan">${icon('scan')} Run scan</button>`,
        })}
        <p class="body-m hushed" style="max-width:60ch;margin-top:-12px;margin-bottom:24px">
          Stalled quotations, quotations under the margin floor, and discounts that sit far
          outside what this customer usually gets. Every threshold is a policy row.
        </p>

        <div class="grid grid-3">
          ${items.length ? items.map((e) => `
            <div class="card lift">
              <div class="card-head">
                ${badge(e.severity, riskTone[e.severity])}
                <span class="hushed body-xs">${esc(ago(e.createdAt))}</span>
              </div>
              <a class="card-link-title row-link" href="#/quotations/${e.quotationId}">
                <span class="body-l">${esc(words(e.type))}</span>
                <span class="arrow hushed">${icon('arrow')}</span>
              </a>
              <p class="body-s hushed" style="margin-top:8px">${esc(e.detail)}</p>
              <button class="btn btn-sm btn-quiet" data-nudge="${e.quotationId}"
                style="margin-top:16px">Nudge</button>
            </div>`).join('')
          : `<div class="card span-all"><div class="empty">
              Nothing unhealthy. Run a scan after moving some quotations.</div></div>`}
        </div>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelector('#scan').addEventListener('click', guard(toast,
        () => api.scanHealth(),
        (r) => { toast(`Scanned ${r.scanned} quotations · ${r.opened} opened · ${r.resolved} resolved.`); reload() }))

      root.querySelectorAll('[data-nudge]').forEach((b) =>
        b.addEventListener('click', guard(toast,
          () => api.nudge(b.dataset.nudge),
          () => toast('Nudge recorded in the audit log.'))))
    },
  }
}

// ═══════════════════════════ Policies ═══════════════════════════

export async function policiesView() {
  const [policies, tiers, categories] = await Promise.all([
    api.policies(), api.tiers(), api.categories(),
  ])
  const tierName = Object.fromEntries(tiers.map((t) => [t.id, t.code]))
  const catName = Object.fromEntries(categories.items.map((c) => [c.id, c.name]))
  const editable = api.session.can('ADMIN', 'FINANCE')

  const field = (p, key) => `
    <input class="input-inline" type="number" min="0" step="50" value="${p[key]}"
      data-policy="${p.id}" data-key="${key}" ${editable ? '' : 'disabled'}
      aria-label="${esc(words(key))} for ${esc(tierName[p.tierId])} ${esc(catName[p.categoryId] ?? 'default')}">`

  const byTier = tiers.map((t) => [t, policies.items.filter((p) => p.tierId === t.id)])
    .filter(([, rows]) => rows.length)

  return {
    title: 'Policies',
    html: `
      <div class="container">
        ${pageHead({ eyebrow: 'Governance', title: 'Discount policy' })}
        <p class="body-m hushed" style="max-width:64ch;margin-top:-12px;margin-bottom:24px">
          Every threshold that decides an outcome is a row here, never a literal in code.
          Values are basis points — 1200 is 12%. Editing one retunes the next evaluation,
          and the change is written to the audit log.
        </p>

        <div class="stack-l">
          ${byTier.map(([tier, rows]) => `
            <section>
              <div class="card-head">
                <h2 class="headline-xs leading-trim">${esc(tier.name)}</h2>
                <span class="hushed body-xs">${rows.length} rule${rows.length === 1 ? '' : 's'}</span>
              </div>
              ${table(
                [{ label: 'Scope' }, { label: 'Ceiling', num: true }, { label: 'Manager above', num: true },
                 { label: 'Finance above', num: true }, { label: 'Target margin', num: true },
                 { label: 'Stalled after', num: true }],
                rows.map((p) => `
                  <tr>
                    <td>${p.categoryId
                      ? `<span class="badge badge-outline">${esc(catName[p.categoryId] ?? 'category')}</span>`
                      : `<span class="hushed">tier default</span>`}</td>
                    <td class="num">${field(p, 'maxDiscountBps')}</td>
                    <td class="num">${field(p, 'requiresManagerAboveBps')}</td>
                    <td class="num">${field(p, 'requiresFinanceAboveBps')}</td>
                    <td class="num">${field(p, 'targetMarginBps')}</td>
                    <td class="num"><input class="input-inline" type="number" min="1" step="1"
                      value="${p.stalledAfterDays}" data-policy="${p.id}" data-key="stalledAfterDays"
                      ${editable ? '' : 'disabled'} aria-label="Stalled after days"></td>
                  </tr>`),
                'No rules for this tier.',
              )}
            </section>`).join('')}
        </div>
        ${editable ? '' : `<p class="body-s hushed spacer-t-m">Read only — retuning is admin and finance.</p>`}
      </div>`,
    mount(root, { toast }) {
      root.querySelectorAll('[data-policy]').forEach((input) =>
        input.addEventListener('change', guard(toast,
          () => api.updatePolicy(input.dataset.policy, { [input.dataset.key]: Number(input.value) }),
          () => toast(`${words(input.dataset.key)} saved — the next evaluation uses it.`))))
    },
  }
}

// ═══════════════════════════ Audit ═══════════════════════════

export async function auditView() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const entityType = params.get('entityType') ?? ''
  const { items, total } = await api.audit({ entityType, page: 1 })

  return {
    title: 'Audit',
    html: `
      <div class="container">
        ${pageHead({ eyebrow: 'Governance', title: 'Audit log' })}
        <p class="body-m hushed" style="max-width:64ch;margin-top:-12px;margin-bottom:24px">
          Append only. Every state transition writes a row in the same transaction as the
          transition itself — if the write fails, the transition never happened.
        </p>

        <div class="row" style="margin-bottom:24px">
          <div class="field" style="width:220px">
            <label class="label" for="f-type">Entity</label>
            <select id="f-type">
              <option value="">Everything</option>
              ${['Quotation', 'Order', 'ApprovalRequest', 'DiscountPolicy', 'Customer'].map((t) =>
                `<option value="${t}"${t === entityType ? ' selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <span class="hushed body-s" style="align-self:flex-end;padding-bottom:12px">${total} entries</span>
        </div>

        ${table(
          [{ label: 'When' }, { label: 'Entity' }, { label: 'Action' }, { label: 'Change' }],
          items.map((t) => `
            <tr>
              <td class="hushed body-xs nowrap">${esc(when(t.createdAt))}</td>
              <td>${esc(t.entityType)}
                <span class="hushed body-xs">${esc(t.entityId.slice(-6))}</span></td>
              <td>${esc(words(t.action))}</td>
              <td class="hushed body-xs">${t.fromValue
                ? `${esc(words(t.fromValue).slice(0, 40))} → ${esc(words(t.toValue).slice(0, 40))}`
                : esc(words(t.toValue).slice(0, 60)) || '—'}</td>
            </tr>`),
          'Nothing logged yet.',
        )}
      </div>`,
    mount(root) {
      root.querySelector('#f-type').addEventListener('change', (e) => {
        location.hash = `#/audit${e.target.value ? `?entityType=${e.target.value}` : ''}`
      })
    },
  }
}

// ═══════════════════════════ Customer portal ═══════════════════════════

export async function portalView(token) {
  const quote = await api.portalQuote(token)
  // The response type physically omits score, margin and approval detail — this
  // screen could not show them if it wanted to.
  const acceptable = !quote.approvalPending && quote.status !== 'CONFIRMED'

  return {
    chrome: 'portal',
    title: quote.code,
    html: `
      <div class="container">
        <div class="page-head">
          <p class="eyebrow">Your quotation</p>
          <h1 class="headline-m leading-trim">${esc(quote.code)}</h1>
          <div class="row" style="margin-top:16px">
            ${badge(quote.status)}
            ${quote.validUntil ? `<span class="hushed body-s">valid until ${esc(when(quote.validUntil))}</span>` : ''}
          </div>
          ${quote.approvalPending
            ? `<p class="body-m hushed" style="margin-top:16px;max-width:56ch">
                 This quotation is under review with your account team. You will be able to
                 accept it once that review finishes.</p>` : ''}
        </div>

        <div class="grid split">
          ${table(
            [{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Unit', num: true }, { label: 'Total', num: true }],
            quote.lines.map((l) => `
              <tr>
                <td>${esc(l.description)}
                  <div class="hushed body-xs">${l.lineType === 'RECURRING' ? 'Recurring' : 'One time'}</div></td>
                <td class="num">${l.qty}</td>
                <td class="num">${money(l.unitPrice)}</td>
                <td class="num">${money(l.lineTotal)}</td>
              </tr>`),
            'This quotation has no lines yet.',
          )}

          <div class="stack-l">
            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Summary</h2></div>
              <div class="stack" style="gap:8px">
                <div class="row-between"><span class="hushed body-s">Subtotal</span><span class="tnum">${money(quote.totals.subtotal)}</span></div>
                <div class="row-between"><span class="hushed body-s">Discount</span><span class="tnum">−${money(quote.totals.discount)}</span></div>
                <div class="row-between"><span class="hushed body-s">Tax</span><span class="tnum">${money(quote.totals.tax)}</span></div>
                <div class="row-between" style="border-top:1px solid var(--border-primary);padding-top:12px;margin-top:4px">
                  <span>Total</span><span class="headline-xs leading-trim tnum">${money(quote.totals.total)}</span></div>
              </div>
              ${acceptable
                ? `<button class="btn btn-primary" id="accept" style="width:100%;margin-top:20px">
                     Accept this quotation</button>
                   <p class="body-xs hushed" style="margin-top:12px">Accepting turns it into an order.</p>`
                : `<p class="body-s hushed" style="margin-top:20px">${quote.status === 'CONFIRMED'
                    ? 'Accepted. Your account team is preparing the order.'
                    : 'Waiting on your account team.'}</p>`}
            </div>
          </div>
        </div>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelector('#accept')?.addEventListener('click', guard(toast,
        () => api.portalConfirm(token),
        (res) => {
          toast(res.outcome === 'CONFIRMED'
            ? 'Accepted — your order has been raised.'
            : 'Thank you. This needs one more internal approval before it can be accepted.')
          reload()
        }))
    },
  }
}
