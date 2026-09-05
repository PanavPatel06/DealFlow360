// The one place the browser talks to the API. Vite proxies /api to the backend,
// so there is no port and no CORS in here.
const BASE = '/api/v1'

const store = {
  get token() { return localStorage.getItem('df.token') },
  get user() { try { return JSON.parse(localStorage.getItem('df.user')) } catch { return null } },
  set(tokens) {
    localStorage.setItem('df.token', tokens.accessToken)
    localStorage.setItem('df.user', JSON.stringify(tokens.user))
  },
  clear() { localStorage.removeItem('df.token'); localStorage.removeItem('df.user') },
}

/** Every failure arrives as the one envelope from plan.md section 8. */
export class ApiError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(store.token ? { authorization: `Bearer ${store.token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  let payload
  try { payload = await res.json() } catch { throw new ApiError('NETWORK', `The server answered ${res.status}.`) }

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

  async login(email, password) {
    const tokens = await request('POST', '/auth/login', { email, password })
    store.set(tokens)
    return tokens
  },
  logout() { store.clear(); location.hash = '#/login' },

  customers: () => request('GET', '/customers'),
  products: (q) => request('GET', `/products${qs({ q })}`),
  warehouses: () => request('GET', '/warehouses'),

  quotes: (params) => request('GET', `/quotes${qs(params)}`),
  quote: (id) => request('GET', `/quotes/${id}`),
  createQuote: (customerId, currency) => request('POST', '/quotes', { customerId, currency }),
  addLine: (id, line) => request('POST', `/quotes/${id}/lines`, line),
  updateLine: (id, lineId, patch) => request('PATCH', `/quotes/${id}/lines/${lineId}`, patch),
  removeLine: (id, lineId) => request('DELETE', `/quotes/${id}/lines/${lineId}`),
  submit: (id) => request('POST', `/quotes/${id}/submit`),
  confirm: (id) => request('POST', `/quotes/${id}/confirm`),
  upsell: (id) => request('GET', `/quotes/${id}/upsell`),
  evaluations: (id) => request('GET', `/quotes/${id}/evaluations`),

  approvals: (params) => request('GET', `/approvals${qs(params)}`),
  approval: (id) => request('GET', `/approvals/${id}`),
  decide: (id, action, reason) => request('POST', `/approvals/${id}/${action}`, { reason }),

  dealHealth: () => request('GET', '/deal-health'),
  scanHealth: () => request('POST', '/deal-health/scan'),
  audit: (entityId) => request('GET', `/audit${qs({ entityType: 'Quotation', entityId })}`),
  policies: () => request('GET', '/policies/discount'),

  orders: () => request('GET', '/orders'),
  portalQuote: (token) => request('GET', `/portal/quotes/${token}`),
}
