import './styles.css'
import { api } from './api.js'
import { esc, icon, initials, words, mountCounters, mountTicker } from './ui.js'
import * as views from './views.js'

// Nav is filtered by role, so a rep never sees a screen the API would refuse.
// The roles live here only to hide links; every rule is still enforced server-side.
const NAV = [
  { href: '#/', label: 'Overview' },
  { href: '#/quotations', label: 'Quotations' },
  { href: '#/approvals', label: 'Approvals' },
  { href: '#/orders', label: 'Orders' },
  { href: '#/customers', label: 'Customers' },
  { href: '#/catalog', label: 'Catalog' },
  { href: '#/deal-health', label: 'Deal health' },
  { href: '#/policies', label: 'Policies', roles: ['ADMIN', 'FINANCE'] },
  { href: '#/audit', label: 'Audit', roles: ['ADMIN', 'FINANCE', 'SALES_MANAGER'] },
]

const routes = [
  [/^#\/$/, () => views.dashboardView()],
  [/^#\/login$/, () => views.loginView()],
  [/^#\/quotations$/, () => views.quotesView()],
  [/^#\/quotations\/([^/]+)$/, (id) => views.quoteView(id)],
  [/^#\/approvals$/, () => views.approvalsView()],
  [/^#\/approvals\/([^/]+)$/, (id) => views.approvalView(id)],
  [/^#\/orders$/, () => views.ordersView()],
  [/^#\/orders\/([^/]+)$/, (id) => views.orderView(id)],
  [/^#\/customers$/, () => views.customersView()],
  [/^#\/customers\/([^/]+)$/, (id) => views.customerView(id)],
  [/^#\/catalog$/, () => views.catalogView()],
  [/^#\/deal-health$/, () => views.healthView()],
  [/^#\/policies$/, () => views.policiesView()],
  [/^#\/audit$/, () => views.auditView()],
  [/^#\/portal\/([^/]+)$/, (token) => views.portalView(token)],
]

const app = document.querySelector('#app')

function toast(message, isError = false) {
  const el = document.querySelector('#toast')
  el.textContent = message
  el.className = `toast show${isError ? ' error' : ''}`
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { el.className = 'toast' }, 5000)
}

// §4: the banner height folds into --nav-height, so dismissing it reflows the
// entire page for free — no listener, no measurement, one CSS variable.
const bannerDismissed = () => localStorage.getItem('df.banner') === 'off'
const banner = () => `
  <div class="banner" id="banner"${bannerDismissed() ? ' hidden' : ''}>
    <div class="container">
      <span class="body-xs">Demo data — five seeded staff accounts, two customers. Reset with <code>npm run seed</code>.</span>
      <button type="button" id="banner-x" aria-label="Dismiss the banner">Dismiss</button>
    </div>
  </div>`

function shell(inner, kind) {
  const user = api.session.user
  if (kind === 'portal') {
    return `
      <header class="nav">${banner()}
        <div class="container nav-inner">
          <span class="brand"><span class="brand-mark">${icon('bolt', 15)}</span><span>DealFlow360</span></span>
          <span class="hushed body-s" style="margin-left:auto">Customer portal</span>
        </div>
      </header>
      <main id="main">${inner}</main>`
  }

  const here = '#/' + (location.hash.split('?')[0].split('/')[1] ?? '')
  const links = NAV.filter((n) => !n.roles || api.session.can(...n.roles))
  const link = (n) =>
    `<a class="nav-item" href="${n.href}"${n.href === here ? ' aria-current="page"' : ''}>${n.label}</a>`

  return `
    <header class="nav">${banner()}
      <div class="container nav-inner">
        <a class="brand" href="#/"><span class="brand-mark">${icon('bolt', 15)}</span><span>DealFlow360</span></a>
        <nav class="nav-links" aria-label="Main">${links.map(link).join('')}</nav>
        <div class="nav-user">
          <button class="nav-item hamburger" id="burger" aria-expanded="false" aria-controls="sheet"
            aria-label="Menu">${icon('menu', 18)}</button>
          <span class="avatar" aria-hidden="true">${esc(initials(user?.name))}</span>
          <span class="who-name">${esc(user?.name ?? '')}<span class="hushed"> · ${esc(words(user?.role))}</span></span>
          <button class="nav-item" id="logout">Sign out</button>
        </div>
      </div>
      <div class="nav-sheet" id="sheet" data-state="closed" hidden>${links.map(link).join('')}</div>
    </header>
    <main id="main">${inner}</main>`
}

const loading = `
  <div class="container"><div class="page-head stack" style="gap:12px;max-width:420px">
    <div class="skeleton" style="height:12px;width:35%"></div>
    <div class="skeleton" style="height:34px;width:70%"></div>
  </div></div>`

async function render() {
  const hash = location.hash || '#/'
  const isPortal = hash.startsWith('#/portal/')

  if (!api.session.token && !isPortal && hash !== '#/login') { location.hash = '#/login'; return }
  if (api.session.token && hash === '#/login') { location.hash = '#/'; return }

  // Screens keep their filters in a query string on the hash. Routes match the
  // path in front of it; the view reads the params off location.hash itself.
  const path = hash.split('?')[0]
  const match = routes.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m)
  if (!match) { location.hash = '#/'; return }

  app.innerHTML = api.session.token && !isPortal ? shell(loading) : loading

  let view
  try {
    view = await match[1](...match[0].slice(1))
  } catch (e) {
    view = {
      html: `<div class="container"><div class="page-head">
        <p class="eyebrow">${esc(e.code ?? 'ERROR')}</p>
        <h1 class="headline-s leading-trim">That did not load</h1>
        <p class="body-m hushed" style="margin-top:12px;max-width:52ch">${esc(e.message)}</p>
        <div class="row spacer-t-m">
          <button class="btn btn-primary" onclick="location.reload()">Try again</button>
          <a class="btn btn-quiet" href="#/">Back to overview</a>
        </div></div></div>`,
    }
  }

  app.innerHTML = view.chrome === false ? view.html : shell(view.html, view.chrome)
  document.title = view.title ? `${view.title} · DealFlow360` : 'DealFlow360'

  app.querySelector('#logout')?.addEventListener('click', () => api.logout())
  app.querySelector('#banner-x')?.addEventListener('click', (e) => {
    localStorage.setItem('df.banner', 'off')
    e.target.closest('#banner').hidden = true
  })

  // §5 the sheet's enter and exit are deliberately asymmetric, so the closing
  // animation has to finish before the element is hidden.
  const burger = app.querySelector('#burger')
  const sheet = app.querySelector('#sheet')
  burger?.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    if (open) {
      sheet.dataset.state = 'closed'
      sheet.addEventListener('animationend', () => { sheet.hidden = true }, { once: true })
    } else {
      sheet.hidden = false
      sheet.dataset.state = 'open'
    }
  })

  mountCounters(app)
  mountTicker(app)
  await view.mount?.(app, { toast, reload: render })
}

addEventListener('hashchange', render)
render()
