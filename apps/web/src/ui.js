// Rendering helpers shared by every screen. Formatting and markup only — no
// screen in this app decides anything (Plan.md invariant 2), and neither does
// this file. It asks the API and prints the answer.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const money = (m) =>
  m == null ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: m.currency, maximumFractionDigits: 0 })
        .format(m.amountMinor / 100)

/** Basis points are the wire format everywhere; percent is only ever a label. */
export const pct = (bps) => (bps == null ? '—' : `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`)

export const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

export const words = (s) => String(s ?? '').replace(/_/g, ' ').toLowerCase()
export const initials = (name) => (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2)

// ---------- icons ----------
// design.md §10 defects 1 and 2: Ramp ships 264 KB of icon font for 13 glyphs and
// screen readers announce the ligature text ("arrow underscore outward"). Inline
// SVG is under 1 KB and fixes both. Every one is aria-hidden.
const PATHS = {
  arrow: 'M7 17 17 7M9 7h8v8',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 13 4 4L19 7',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.5 17.5A1.7 1.7 0 0 0 4 20h16a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  scan: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3',
  menu: 'M4 7h16M4 12h16M4 17h16',
}
export const icon = (name, size = 16, cls = '') =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`

// ---------- status vocabulary ----------
const STATUS_TONE = {
  DRAFT: 'neutral', SUBMITTED: 'info', AUTO_APPROVED: 'ok', APPROVED: 'ok', CONFIRMED: 'ok',
  COMPLETED: 'ok', PENDING_MANAGER: 'pending', PENDING_FINANCE: 'pending', NEGOTIATING: 'pending',
  RETURNED: 'over', REJECTED: 'over', CANCELLED: 'over', FULFILLING: 'info', PENDING: 'pending',
}
export const badge = (value, tone) =>
  `<span class="badge badge-${tone ?? STATUS_TONE[value] ?? 'neutral'}">${esc(words(value).toUpperCase())}</span>`
export const riskTone = { LOW: 'ok', MEDIUM: 'pending', HIGH: 'over' }

// ---------- structure ----------
export const pageHead = ({ eyebrow, title, actions = '', crumb }) => `
  <div class="page-head row-between">
    <div>
      <p class="eyebrow">${crumb ?? esc(eyebrow)}</p>
      <h1 class="headline-m leading-trim">${esc(title)}</h1>
    </div>
    <div class="row">${actions}</div>
  </div>`

/** One table renderer, so every table in the app has the same empty state. */
export const table = (cols, rows, emptyText) => `
  <div class="card card-white card-flush">
    <div class="table-wrap">
      <table>
        <thead><tr>${cols.map((c) =>
          `<th${c.num ? ' class="num"' : ''}>${esc(c.label ?? '')}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.join('')
          : `<tr><td colspan="${cols.length}"><div class="empty">${esc(emptyText)}</div></td></tr>`}</tbody>
      </table>
    </div>
  </div>`

export const stat = (label, value, hint = '') => `
  <div class="card">
    <p class="label">${esc(label)}</p>
    <div class="headline-s leading-trim tnum" style="margin-top:8px">${value}</div>
    ${hint ? `<p class="body-xs hushed" style="margin-top:8px">${esc(hint)}</p>` : ''}
  </div>`

/** A card that is entirely a link, with the §5 arrow that flies out on hover. */
export const linkCard = (href, title, body, extra = '') => `
  <a class="card lift" href="${href}">
    <div class="card-link-title">
      <span class="body-l">${esc(title)}</span>
      <span class="arrow hushed">${icon('arrow')}</span>
    </div>
    <p class="body-s hushed" style="margin-top:8px">${esc(body)}</p>
    ${extra}
  </a>`

export const acc = (summary, body, open = false) => `
  <details class="acc"${open ? ' open' : ''}>
    <summary><span>${esc(summary)}</span><span class="chev hushed">${icon('chevron', 14)}</span></summary>
    <div class="acc-body">${body}</div>
  </details>`

// ---------- counters ----------
// design.md §5: NumberFlow pairs role="img" with aria-label so a screen reader
// gets one stable string instead of every intermediate digit, and runs its own
// reduced-motion check. Both are reproduced here; the spec itself offers "20
// lines of requestAnimationFrame" as the alternative to the 8 KB dependency.
export const counter = (value, label) =>
  `<span class="count tnum" data-to="${value}" role="img" aria-label="${esc(label)}">0</span>`

export function mountCounters(root) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  root.querySelectorAll('.count').forEach((el) => {
    const to = Number(el.dataset.to) || 0
    const fmt = (n) => n.toLocaleString('en-IN')
    if (still || to === 0) { el.textContent = fmt(to); return }
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 900)
      el.textContent = fmt(Math.round(to * (1 - (1 - p) ** 3)))   // ease-out cubic
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * design.md §5: duration comes from track length divided by a constant speed, so
 * every marquee moves at the same px/s no matter how long its track is. The
 * paired keyframe offsets by -50% minus half the gap, which is the detail
 * hand-rolled marquees get wrong.
 */
export function mountTicker(root) {
  root.querySelectorAll('.ticker-track').forEach((track) => {
    track.style.setProperty('--marquee-duration', `${track.scrollWidth / 60}s`)
  })
}

// ---------- dialogs ----------
/** Replaces window.prompt, which cannot be styled and blocks the whole tab. */
export function ask(question, { placeholder = '', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog')
    dlg.className = 'raised'
    dlg.innerHTML = `
      <form method="dialog" class="stack" style="gap:20px">
        <h2 class="headline-xs leading-trim">${esc(question)}</h2>
        <div class="field">
          <label class="label" for="ask-reason">Reason — it is written to the audit log</label>
          <textarea id="ask-reason" rows="3" placeholder="${esc(placeholder)}"></textarea>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" value="">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(confirmLabel)}</button>
        </div>
      </form>`
    document.body.append(dlg)
    dlg.addEventListener('close', () => {
      const value = dlg.returnValue === 'ok' ? dlg.querySelector('#ask-reason').value.trim() : null
      dlg.remove()
      resolve(value)
    })
    dlg.showModal()
  })
}
