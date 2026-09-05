import './styles.css'
import { api } from './api.js'
import {
  loginView, quotesView, quoteView, approvalsView, approvalView,
  healthView, ordersView, portalView,
} from './views.js'

const NAV = [
  ['#/quotations', 'Quotations'],
  ['#/approvals', 'Approvals'],
  ['#/orders', 'Orders'],
  ['#/deal-health', 'Deal health'],
]

const routes = [
  [/^#\/login$/, () => loginView()],
  [/^#\/quotations$/, () => quotesView()],
  [/^#\/quotations\/(.+)$/, (id) => quoteView(id)],
  [/^#\/approvals$/, () => approvalsView()],
  [/^#\/approvals\/(.+)$/, (id) => approvalView(id)],
  [/^#\/deal-health$/, () => healthView()],
  [/^#\/orders$/, () => ordersView()],
  [/^#\/portal\/(.+)$/, (token) => portalView(token)],
]

const app = document.querySelector('#app')

function toast(message, isError = false) {
  const el = document.querySelector('#toast')
  el.textContent = message
  el.className = `toast show${isError ? ' error' : ''}`
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { el.className = 'toast' }, 4000)
}

function shell(inner, kind) {
  const user = api.session.user
  if (kind === 'portal') {
    return `<header class="nav"><div class="container nav-inner">
        <div class="brand"><span class="brand-mark">d</span><span>DealFlow360</span></div>
        <span class="hushed body-s">Customer portal</span>
      </div></header><main>${inner}</main>`
  }
  const here = location.hash.split('/').slice(0, 2).join('/')
  return `
    <header class="nav"><div class="container nav-inner">
      <div class="brand"><span class="brand-mark">d</span><span>DealFlow360</span></div>
      ${NAV.map(([href, label]) => `<button class="nav-item ${here === href ? 'active' : ''}" data-go="${href}">${label}</button>`).join('')}
      <div class="nav-user">
        <span class="avatar">${(user?.name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
        <span>${user?.name ?? ''}<span class="hushed"> · ${(user?.role ?? '').replace(/_/g, ' ')}</span></span>
        <button class="nav-item" id="logout">Sign out</button>
      </div>
    </div></header>
    <main>${inner}</main>`
}

async function render() {
  const hash = location.hash || '#/quotations'
  const isPortal = hash.startsWith('#/portal/')

  if (!api.session.token && !isPortal && hash !== '#/login') { location.hash = '#/login'; return }

  const match = routes.map(([re, fn]) => [hash.match(re), fn]).find(([m]) => m)
  if (!match) { location.hash = '#/quotations'; return }

  app.innerHTML = `<div class="container"><div class="page-head hushed body-m">Loading…</div></div>`
  let view
  try {
    view = await match[1](...match[0].slice(1))
  } catch (e) {
    app.innerHTML = `<div class="container"><div class="page-head">
        <h1 class="headline-s leading-trim">That did not load</h1>
        <p class="body-m hushed" style="margin-top:8px">${e.code ? `${e.code}: ` : ''}${e.message}</p>
        <button class="btn spacer-t-m" onclick="location.reload()">Try again</button>
      </div></div>`
    return
  }

  app.innerHTML = view.chrome === false ? view.html : shell(view.html, view.chrome)

  app.querySelectorAll('[data-go]').forEach((el) =>
    el.addEventListener('click', () => { location.hash = el.dataset.go }))
  app.querySelector('#logout')?.addEventListener('click', () => api.logout())

  view.mount?.(app, { toast, reload: render })
}

addEventListener('hashchange', render)
render()
