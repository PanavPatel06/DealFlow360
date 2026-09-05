import { api } from './api.js'

// ---------- formatting only. No screen decides anything (plan.md invariant 2). ----------

export const money = (m) =>
  m == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: m.currency, maximumFractionDigits: 0 })
        .format(m.amountMinor / 100)

export const pct = (bps) => (bps == null ? '—' : `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`)
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const STATUS_TONE = {
  DRAFT: 'neutral', SUBMITTED: 'info', AUTO_APPROVED: 'ok', APPROVED: 'ok', CONFIRMED: 'ok',
  COMPLETED: 'ok', PENDING_MANAGER: 'pending', PENDING_FINANCE: 'pending', NEGOTIATING: 'pending',
  RETURNED: 'over', REJECTED: 'over', FULFILLING: 'info',
}
export const statusBadge = (s) => `<span class="badge badge-${STATUS_TONE[s] ?? 'neutral'}">${esc(s.replace(/_/g, ' '))}</span>`

const riskTone = { LOW: 'ok', MEDIUM: 'pending', HIGH: 'over' }

// ---------- Login ----------

export function loginView() {
  const demo = ['rep', 'manager', 'finance', 'ops', 'admin']
  return {
    chrome: false,
    html: `
      <div class="login-wrap">
        <div class="login-card stack" style="gap:24px">
          <div class="row"><span class="brand-mark">d</span><span class="body-l">DealFlow360</span></div>
          <div>
            <h1 class="headline-s leading-trim">Sign in</h1>
            <p class="body-m hushed" style="margin-top:8px">Quote to cash, with the governance inside the lifecycle.</p>
          </div>
          <form id="login" class="stack" style="gap:16px">
            <div class="field"><label class="label" for="email">Work email</label>
              <input id="email" name="email" type="email" value="rep@dealflow.test" required></div>
            <div class="field"><label class="label" for="password">Password</label>
              <input id="password" name="password" type="password" value="password123" required></div>
            <button class="btn btn-primary" type="submit">Sign in</button>
          </form>
          <div class="stack" style="gap:8px">
            <span class="label">Seeded accounts, password123</span>
            <div class="who">${demo.map((r) => `<button type="button" data-who="${r}@dealflow.test">${r}</button>`).join('')}</div>
          </div>
        </div>
      </div>`,
    mount(root, { toast }) {
      root.querySelectorAll('[data-who]').forEach((b) =>
        b.addEventListener('click', () => { root.querySelector('#email').value = b.dataset.who }))
      root.querySelector('#login').addEventListener('submit', async (e) => {
        e.preventDefault()
        const f = new FormData(e.target)
        try {
          await api.login(f.get('email'), f.get('password'))
          location.hash = '#/quotations'
        } catch (err) { toast(err.message, true) }
      })
    },
  }
}

// ---------- Quotations list ----------

export async function quotesView() {
  const [{ items }, customers] = await Promise.all([api.quotes({ pageSize: 50 }), api.customers()])
  const rows = items.length
    ? items.map((q) => `
        <tr class="clickable" data-go="#/quotations/${q.id}">
          <td><a class="row-link" href="#/quotations/${q.id}">${esc(q.code)}</a></td>
          <td>${esc(q.customer.name)} <span class="hushed body-xs">${esc(q.customer.tier)}</span></td>
          <td>${statusBadge(q.status)}</td>
          <td class="num">${money(q.total)}</td>
          <td class="hushed body-xs">${when(q.lastActivityAt)}</td>
        </tr>`).join('')
    : `<tr><td colspan="5"><div class="empty">No quotations yet. Create one to start the chain.</div></td></tr>`

  return {
    html: `
      <div class="container">
        <div class="page-head row-between">
          <div><p class="eyebrow">Sales</p><h1 class="headline-m leading-trim">Quotations</h1></div>
          <button class="btn btn-primary" id="new">New quotation</button>
        </div>
        <div class="card card-white" style="padding:8px">
          <table>
            <thead><tr><th>Code</th><th>Customer</th><th>Status</th><th class="num">Total</th><th>Last activity</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <dialog id="dlg" class="raised" style="border:none;border-radius:16px;padding:32px;max-width:420px;width:100%">
          <form method="dialog" class="stack" style="gap:20px">
            <h2 class="headline-xs leading-trim">New quotation</h2>
            <div class="field"><label class="label" for="cus">Customer</label>
              <select id="cus">${customers.items.map((c) => `<option value="${c.id}" data-cur="${c.currency}">${esc(c.name)} — ${esc(c.tier?.code ?? c.tier?.name ?? '')}</option>`).join('')}</select></div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn" value="cancel">Cancel</button>
              <button class="btn btn-primary" id="create" value="create">Create</button>
            </div>
          </form>
        </dialog>
      </div>`,
    mount(root, { toast }) {
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

// ---------- Quote builder: the centrepiece ----------

export async function quoteView(id) {
  const [quote, products, upsell] = await Promise.all([api.quote(id), api.products(), api.upsell(id).catch(() => ({ items: [] }))])
  const editable = quote.status === 'DRAFT' || quote.status === 'RETURNED'
  const ev = quote.evaluation

  const lineRow = (l) => {
    const over = l.overBps > 0
    return `
      <tr data-line="${l.id}">
        <td>
          <div>${esc(l.description)}</div>
          <div class="hushed body-xs">${esc(l.lineType === 'RECURRING' ? 'Recurring' : 'One time')} · ${money(l.unitPrice)} each</div>
        </td>
        <td class="num">
          ${editable ? `<input class="qty" type="number" min="1" value="${l.qty}" data-field="qty">` : l.qty}
        </td>
        <td class="num">
          ${editable
            ? `<input class="bps ${over ? 'over' : ''}" type="number" min="0" max="10000" step="50" value="${l.discountBps}" data-field="discountBps">`
            : pct(l.discountBps)}
        </td>
        <td>
          ${over
            ? `<span class="badge badge-over">OVER ${pct(l.overBps)}</span>
               <div class="hushed body-xs" style="margin-top:4px">ceiling ${pct(l.allowedDiscountBps)}</div>`
            : l.allowedDiscountBps != null
              ? `<span class="hushed body-xs">within ${pct(l.allowedDiscountBps)}</span>`
              : `<span class="hushed body-xs">within ceiling</span>`}
        </td>
        <td class="num">${money(l.lineTotal)}</td>
        <td class="num">${editable ? `<button class="btn-icon" data-remove="${l.id}" title="Remove line">×</button>` : ''}</td>
      </tr>`
  }

  return {
    html: `
      <div class="container">
        <div class="page-head row-between">
          <div>
            <p class="eyebrow"><a href="#/quotations" style="color:inherit">Quotations</a> / ${esc(quote.code)}</p>
            <h1 class="headline-m leading-trim">${esc(quote.customer.name)}</h1>
            <div class="row" style="margin-top:12px">${statusBadge(quote.status)}
              <span class="badge badge-neutral">${esc(quote.customer.tier)}</span></div>
          </div>
          <div class="row">
            ${editable ? `<button class="btn btn-primary" id="submit" ${quote.lines.length ? '' : 'disabled'}>Submit for review</button>` : ''}
            ${quote.status === 'APPROVED' || quote.status === 'AUTO_APPROVED' ? `<button class="btn btn-primary" id="confirm">Confirm and create order</button>` : ''}
          </div>
        </div>

        <div class="grid split">
          <div class="stack" style="gap:24px">
            <div class="card card-white" style="padding:8px">
              <table>
                <thead><tr><th>Line</th><th class="num">Qty</th><th class="num">Discount</th><th>Ceiling</th><th class="num">Total</th><th></th></tr></thead>
                <tbody id="lines">${quote.lines.length ? quote.lines.map(lineRow).join('') : `<tr><td colspan="6"><div class="empty">No lines yet. Add a product below.</div></td></tr>`}</tbody>
              </table>
            </div>

            ${editable ? `
            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Add a line</h2></div>
              <form id="addline" class="row" style="align-items:flex-end;flex-wrap:wrap">
                <div class="field grow" style="min-width:220px"><label class="label" for="prod">Product</label>
                  <select id="prod" name="productId">
                    ${products.items.map((p) => `<option value="${p.id}">${esc(p.name)} — ${esc(p.category.name)} · ${money(p.listPrice)}</option>`).join('')}
                  </select></div>
                <div class="field" style="width:100px"><label class="label" for="qty">Qty</label>
                  <input id="qty" name="qty" type="number" min="1" value="1"></div>
                <div class="field" style="width:130px"><label class="label" for="disc">Discount %</label>
                  <input id="disc" name="discount" type="number" min="0" max="100" step="0.5" value="0"></div>
                <button class="btn btn-primary" type="submit">Add</button>
              </form>
            </div>` : ''}

            ${upsell.items.length ? `
            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Suggested</h2>
                <span class="hushed body-xs">ranked by B2 against what is on the quote</span></div>
              <div class="grid grid-2">
                ${upsell.items.slice(0, 4).map((u) => `
                  <div class="card card-white" style="padding:16px">
                    <div class="row-between" style="gap:12px">
                      <div><div>${esc(u.name)}</div><div class="hushed body-xs">${esc(u.reason)}</div></div>
                      <div class="right"><div>${money(u.unitPrice)}</div>
                        ${editable ? `<button class="btn btn-sm" data-upsell="${u.productId}" style="margin-top:8px">Add</button>` : ''}</div>
                    </div>
                  </div>`).join('')}
              </div>
            </div>` : ''}
          </div>

          <div class="stack" style="gap:24px">
            <div class="card ${ev?.approvalRequired ? 'card-dark' : ''}">
              <div class="card-head"><h2 class="headline-xs leading-trim">Risk</h2>
                ${ev ? `<span class="badge badge-${riskTone[ev.riskLevel] ?? 'neutral'}">${esc(ev.riskLevel)}</span>` : ''}</div>
              ${ev ? `
                <div class="headline-m leading-trim">${ev.riskScore}<span class="body-m hushed"> / 100</span></div>
                <div class="meter ${ev.riskLevel.toLowerCase()}"><i style="width:${ev.riskScore}%"></i></div>
                <p class="body-s" style="margin-top:16px">${ev.approvalRequired
                  ? 'Approval is required. The numbers decided this, nobody asked for it.'
                  : 'Inside every ceiling. This can be confirmed without an approval.'}</p>
                ${quote.approval ? `<p class="body-s hushed" style="margin-top:8px">Waiting on ${esc(String(quote.approval.currentStep ?? '').replace(/_/g, ' '))}</p>` : ''}`
              : `<p class="body-s hushed">Add a line to see the score.</p>`}
            </div>

            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Totals</h2></div>
              <div class="stack" style="gap:8px">
                <div class="row-between"><span class="hushed body-s">Subtotal</span><span>${money(quote.totals.subtotal)}</span></div>
                <div class="row-between"><span class="hushed body-s">Discount</span><span>−${money(quote.totals.discount)}</span></div>
                <div class="row-between"><span class="hushed body-s">Tax</span><span>${money(quote.totals.tax)}</span></div>
                <div class="row-between" style="border-top:1px solid var(--border-primary);padding-top:12px;margin-top:4px">
                  <span>Total</span><span class="headline-xs leading-trim">${money(quote.totals.total)}</span></div>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Customer portal</h2></div>
              <p class="body-s hushed">What the customer sees. No score, no margin, no other customer,
              enforced on the server rather than by hiding it here.</p>
              ${quote.portalToken
                ? `<a class="btn btn-sm" style="margin-top:12px;text-decoration:none"
                     href="#/portal/${quote.portalToken}" target="_blank" rel="noopener">Open portal view</a>`
                : `<p class="body-s hushed" style="margin-top:12px">No portal link on this quote.</p>`}
            </div>
          </div>
        </div>
      </div>`,

    async mount(root, { toast, reload }) {
      const guard = async (fn) => { try { await fn(); reload() } catch (e) { toast(e.message, true) } }

      root.querySelector('#addline')?.addEventListener('submit', (e) => {
        e.preventDefault()
        const f = new FormData(e.target)
        guard(() => api.addLine(id, {
          productId: f.get('productId'),
          qty: Number(f.get('qty')),
          // the browser sends percent as basis points; it never decides anything with it
          discountBps: Math.round(Number(f.get('discount')) * 100),
        }))
      })

      // typing a discount re-evaluates the whole quote, which is what turns the
      // badge red while the person is still typing
      root.querySelectorAll('#lines input').forEach((input) => {
        input.addEventListener('change', () => {
          const lineId = input.closest('[data-line]').dataset.line
          guard(() => api.updateLine(id, lineId, { [input.dataset.field]: Number(input.value) }))
        })
      })

      root.querySelectorAll('[data-remove]').forEach((b) =>
        b.addEventListener('click', () => guard(() => api.removeLine(id, b.dataset.remove))))

      root.querySelectorAll('[data-upsell]').forEach((b) =>
        b.addEventListener('click', () => guard(() => api.addLine(id, { productId: b.dataset.upsell, qty: 1, discountBps: 0 }))))

      root.querySelector('#submit')?.addEventListener('click', async () => {
        try {
          const after = await api.submit(id)
          toast(after.status === 'PENDING_MANAGER'
            ? 'Over a ceiling: the quote routed itself to the sales manager.'
            : 'Inside every ceiling: auto approved.')
          reload()
        } catch (e) { toast(e.message, true) }
      })

      root.querySelector('#confirm')?.addEventListener('click', async () => {
        try {
          const res = await api.confirm(id)
          toast(`Order ${res.orderCode} created from this quote.`)
          reload()
        } catch (e) { toast(e.message, true) }
      })

    },
  }
}

// ---------- Approvals ----------

export async function approvalsView() {
  const { items } = await api.approvals({ status: 'PENDING' })
  const rows = items.length
    ? items.map((a) => `
      <tr class="clickable" data-go="#/approvals/${a.id}">
        <td><a class="row-link" href="#/approvals/${a.id}">${esc(a.quotationId.slice(-6))}</a></td>
        <td>${statusBadge(a.status)}</td>
        <td>${a.steps.map((s) => `<span class="badge badge-${s.status === 'APPROVED' ? 'ok' : s.status === 'PENDING' ? 'pending' : 'over'}">${esc(s.role.replace(/_/g, ' '))}</span>`).join(' ')}</td>
        <td class="hushed body-xs">${when(a.createdAt)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty">Nothing waiting. Submit an over-ceiling quote and it lands here by itself.</div></td></tr>`

  return {
    html: `
      <div class="container">
        <div class="page-head"><p class="eyebrow">Governance</p><h1 class="headline-m leading-trim">Approvals</h1></div>
        <div class="card card-white" style="padding:8px">
          <table><thead><tr><th>Quote</th><th>Status</th><th>Chain</th><th>Raised</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </div>
      </div>`,
  }
}

export async function approvalView(id) {
  const { request, evaluation, trail } = await api.approval(id)
  const violations = evaluation?.violations ?? []
  const mine = request.currentStep === api.session.user?.role

  return {
    html: `
      <div class="container">
        <div class="page-head row-between">
          <div><p class="eyebrow"><a href="#/approvals" style="color:inherit">Approvals</a></p>
            <h1 class="headline-m leading-trim">Why this was flagged</h1></div>
          ${request.status === 'PENDING' ? `
            <div class="row">
              <button class="btn btn-danger" id="return">Return</button>
              <button class="btn btn-danger" id="reject">Reject</button>
              <button class="btn btn-primary" id="approve" ${mine ? '' : 'disabled'}>
                ${mine ? 'Approve' : `Waiting on ${esc(String(request.currentStep ?? '').replace(/_/g, ' '))}`}</button>
            </div>` : statusBadge(request.status)}
        </div>

        <div class="grid split">
          <div class="stack" style="gap:24px">
            <div class="card card-white" style="padding:8px">
              <table>
                <thead><tr><th>Line</th><th class="num">Given</th><th class="num">Allowed</th><th class="num">Over by</th></tr></thead>
                <tbody>${violations.length ? violations.map((v) => `
                  <tr><td>${esc(v.categoryName)}<div class="hushed body-xs">line ${esc(v.quoteLineId.slice(-6))}</div></td>
                    <td class="num">${pct(v.actualBps)}</td>
                    <td class="num">${pct(v.allowedBps)}</td>
                    <td class="num"><span class="badge badge-over">${pct(v.excessBps)}</span></td></tr>`).join('')
                  : `<tr><td colspan="4"><div class="empty">No single line broke its ceiling. The blended total did.</div></td></tr>`}
                </tbody>
              </table>
            </div>

            <div class="card">
              <div class="card-head"><h2 class="headline-xs leading-trim">Audit trail</h2>
                <span class="hushed body-xs">append only</span></div>
              <ul class="trail">
                ${trail.map((t) => `<li><time>${when(t.createdAt)}</time>
                  <span class="grow">${esc(t.action.replace(/_/g, ' ').toLowerCase())}
                  ${t.fromValue ? `<span class="hushed">${esc(t.fromValue)} → ${esc(t.toValue ?? '')}</span>` : t.toValue ? `<span class="hushed">${esc(t.toValue)}</span>` : ''}</span></li>`).join('')}
              </ul>
            </div>
          </div>

          <div class="stack" style="gap:24px">
            <div class="card card-dark">
              <div class="card-head"><h2 class="headline-xs leading-trim">Blended score</h2>
                <span class="badge badge-${riskTone[evaluation?.riskLevel] ?? 'neutral'}">${esc(evaluation?.riskLevel ?? '—')}</span></div>
              <div class="headline-m leading-trim">${evaluation?.riskScore ?? '—'}<span class="body-m hushed"> / 100</span></div>
              <div class="stack" style="gap:8px;margin-top:20px">
                <div class="row-between"><span class="hushed body-s">Weighted excess</span><span>${pct(evaluation?.weightedExcessBps)}</span></div>
                <div class="row-between"><span class="hushed body-s">Worst line</span><span>${pct(evaluation?.worstLineExcessBps)}</span></div>
                <div class="row-between"><span class="hushed body-s">Margin</span><span>${pct(evaluation?.marginBps)}</span></div>
              </div>
            </div>
            <div class="card card-white">
              <div class="card-head"><h2 class="headline-xs leading-trim">Chain</h2></div>
              <ul class="trail">${request.steps.map((s) => `<li>
                <span class="grow">${esc(s.role.replace(/_/g, ' '))}</span>
                <span class="badge badge-${s.status === 'APPROVED' ? 'ok' : s.status === 'PENDING' ? 'pending' : 'over'}">${esc(s.status)}</span></li>`).join('')}</ul>
            </div>
          </div>
        </div>
      </div>`,

    mount(root, { toast, reload }) {
      const decide = async (action) => {
        const reason = action === 'approve' ? undefined : prompt(`Reason for ${action}?`) ?? ''
        try {
          const res = await api.decide(id, action, reason)
          toast(`Recorded. The quote is now ${res.quoteStatus.replace(/_/g, ' ')}.`)
          reload()
        } catch (e) { toast(e.message, true) }
      }
      root.querySelector('#approve')?.addEventListener('click', () => decide('approve'))
      root.querySelector('#reject')?.addEventListener('click', () => decide('reject'))
      root.querySelector('#return')?.addEventListener('click', () => decide('return'))
    },
  }
}

// ---------- Deal health ----------

export async function healthView() {
  const { items } = await api.dealHealth()
  return {
    html: `
      <div class="container">
        <div class="page-head row-between">
          <div><p class="eyebrow">Signals</p><h1 class="headline-m leading-trim">Deal health</h1></div>
          <button class="btn" id="scan">Run scan</button>
        </div>
        <div class="grid grid-3">
          ${items.length ? items.map((e) => `
            <a class="card card-white" href="#/quotations/${e.quotationId}" style="text-decoration:none;color:inherit;display:block">
              <div class="card-head"><span class="badge badge-${riskTone[e.severity] ?? 'neutral'}">${esc(e.severity)}</span>
                <span class="hushed body-xs">${when(e.createdAt)}</span></div>
              <div class="body-l">${esc(e.type.replace(/_/g, ' ').toLowerCase())}</div>
              <p class="body-s hushed" style="margin-top:8px">${esc(e.detail)}</p>
            </a>`).join('')
          : `<div class="card"><div class="empty">Nothing unhealthy. Run a scan after moving some quotes.</div></div>`}
        </div>
      </div>`,
    mount(root, { toast, reload }) {
      root.querySelector('#scan').addEventListener('click', async () => {
        try { const r = await api.scanHealth(); toast(`Scanned ${r.scanned} quotes, ${r.opened} opened, ${r.resolved} resolved.`); reload() }
        catch (e) { toast(e.message, true) }
      })
    },
  }
}

// ---------- Orders ----------

export async function ordersView() {
  const { items } = await api.orders()
  return {
    html: `
      <div class="container">
        <div class="page-head"><p class="eyebrow">Operations</p><h1 class="headline-m leading-trim">Orders</h1></div>
        <div class="card card-white" style="padding:8px">
          <table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th class="num">Total</th></tr></thead>
          <tbody>${items.length ? items.map((o) => `
            <tr><td>${esc(o.code)}</td><td>${esc(o.customer?.name ?? '—')}</td>
              <td>${statusBadge(o.status)}</td><td class="num">${money(o.total)}</td></tr>`).join('')
            : `<tr><td colspan="4"><div class="empty">No orders yet. Confirm an approved quote.</div></td></tr>`}
          </tbody></table>
        </div>
        <div class="card spacer-t-m">
          <p class="body-s hushed">Fulfilment, invoicing and payments have engines and unit tests but no HTTP layer
          yet, so they are not shown here rather than shown fake.</p>
        </div>
      </div>`,
  }
}

// ---------- Customer portal, by token ----------

export async function portalView(token) {
  const quote = await api.portalQuote(token)
  return {
    chrome: 'portal',
    html: `
      <div class="container">
        <div class="page-head">
          <p class="eyebrow">Your quotation</p>
          <h1 class="headline-m leading-trim">${esc(quote.code)}</h1>
          ${quote.approvalPending ? `<p class="body-m hushed" style="margin-top:12px">Under review with your account team.</p>` : ''}
        </div>
        <div class="card card-white" style="padding:8px">
          <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
          <tbody>${quote.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="num">${l.qty}</td>
            <td class="num">${money(l.unitPrice)}</td><td class="num">${money(l.lineTotal)}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card spacer-t-m" style="max-width:360px;margin-left:auto">
          <div class="row-between"><span class="hushed body-s">Subtotal</span><span>${money(quote.totals.subtotal)}</span></div>
          <div class="row-between" style="margin-top:8px"><span class="hushed body-s">Discount</span><span>−${money(quote.totals.discount)}</span></div>
          <div class="row-between" style="margin-top:12px;border-top:1px solid var(--border-primary);padding-top:12px">
            <span>Total</span><span class="headline-xs leading-trim">${money(quote.totals.total)}</span></div>
        </div>
      </div>`,
  }
}
