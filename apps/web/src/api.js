// The one place the browser talks to the API. Vite proxies /api to the backend,
// so there is no port and no CORS in here.
const BASE = '/api/v1'

const store = {
  get token() { return localStorage.getItem('df.token') },
  get refreshToken() { return localStorage.getItem('df.refresh') },
  get user() { try { return JSON.parse(localStorage.getItem('df.user')) } catch { return null } },
  set(tokens) {
    localStorage.setItem('df.token', tokens.accessToken)
    localStorage.setItem('df.refresh', tokens.refreshToken)
    localStorage.setItem('df.user', JSON.stringify(tokens.user))
  },
  clear() { ['df.token', 'df.refresh', 'df.user'].forEach((k) => localStorage.removeItem(k)) },
  /** Screens ask this rather than hard-coding role lists in three places. */
  can(...roles) { return roles.includes(store.user?.role) },
}

/** Every failure arrives as the one envelope from plan.md section 8. */
export class ApiError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

async function send(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(store.token ? { authorization: `Bearer ${store.token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  try { return await res.json() } catch { throw new ApiError('NETWORK', `The server answered ${res.status}.`) }
}

async function request(method, path, body) {
  let payload = await send(method, path, body)

  // The access token lives an hour. Rather than dumping the person back at the
  // sign-in screen mid-quote, spend the refresh token once and replay the call.
  if (!payload.success && payload.error?.code === 'UNAUTHENTICATED' && store.refreshToken) {
    const refreshed = await send('POST', '/auth/refresh', { refreshToken: store.refreshToken })
    if (refreshed.success) {
      store.set(refreshed.data)
      payload = await send(method, path, body)
    }
  }

  if (!payload.success) {
    const e = payload.error ?? {}
    if (e.code === 'UNAUTHENTICATED') { store.clear(); location.hash = '#/login' }
    throw new ApiError(e.code ?? 'UNKNOWN', e.message ?? 'Something went wrong.', e.details)
  }
  return payload.data
}

const qs = (params) => {
  const p = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== ''))
  return p.toString() ? `?${p}` : ''
}

export const api = {
  session: store,

  // ---------- auth ----------
  async login(email, password) {
    const tokens = await request('POST', '/auth/login', { email, password })
    store.set(tokens)
    return tokens
  },
  logout() { store.clear(); location.hash = '#/login' },
  me: () => request('GET', '/auth/me'),

  // ---------- sales ----------
  customers: (params) => request('GET', `/customers${qs(params)}`),
  customer: (id) => request('GET', `/customers/${id}`),
  createCustomer: (body) => request('POST', '/customers', body),
  updateCustomer: (id, patch) => request('PATCH', `/customers/${id}`, patch),
  tiers: () => request('GET', '/customers/tiers'),

  quotes: (params) => request('GET', `/quotes${qs(params)}`),
  quote: (id) => request('GET', `/quotes/${id}`),
  createQuote: (customerId, currency) => request('POST', '/quotes', { customerId, currency }),
  updateQuote: (id, patch) => request('PATCH', `/quotes/${id}`, patch),
  addLine: (id, line) => request('POST', `/quotes/${id}/lines`, line),
  updateLine: (id, lineId, patch) => request('PATCH', `/quotes/${id}/lines/${lineId}`, patch),
  removeLine: (id, lineId) => request('DELETE', `/quotes/${id}/lines/${lineId}`),
  submit: (id) => request('POST', `/quotes/${id}/submit`),
  confirm: (id) => request('POST', `/quotes/${id}/confirm`),

  orders: (params) => request('GET', `/orders${qs(params)}`),
  order: (id) => request('GET', `/orders/${id}`),
  setOrderStatus: (id, status) => request('PATCH', `/orders/${id}/status`, { status }),

  // ---------- intelligence ----------
  evaluate: (id) => request('POST', `/quotes/${id}/evaluate`),
  evaluations: (id) => request('GET', `/quotes/${id}/evaluations`),
  upsell: (id) => request('GET', `/quotes/${id}/upsell`),

  approvals: (params) => request('GET', `/approvals${qs(params)}`),
  approval: (id) => request('GET', `/approvals/${id}`),
  decide: (id, action, reason) => request('POST', `/approvals/${id}/${action}`, { reason }),

  dealHealth: (quotationId) => request('GET', `/deal-health${quotationId ? `/${quotationId}` : ''}`),
  scanHealth: () => request('POST', '/deal-health/scan'),
  nudge: (quotationId) => request('POST', `/deal-health/${quotationId}/nudge`),

  audit: (params) => request('GET', `/audit${qs(params)}`),
  policies: () => request('GET', '/policies/discount'),
  updatePolicy: (id, patch) => request('PUT', `/policies/discount/${id}`, patch),

  // ---------- operations ----------
  products: (q) => request('GET', `/products${qs({ q })}`),
  categories: () => request('GET', '/categories'),
  warehouses: () => request('GET', '/warehouses'),

  // ---------- the customer's own view ----------
  portalQuote: (token) => request('GET', `/portal/quotes/${token}`),
  portalConfirm: (token) => request('POST', `/portal/quotes/${token}/confirm`),
}
