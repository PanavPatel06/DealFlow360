import './styles.css'

const icons = {
  grid: '<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  quotes: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  customers: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3.5 2.4-5 5.5-5s5 1.5 5.5 5M15 5.5a3 3 0 0 1 0 5.8M16 15c2.8.2 4.2 1.8 4.5 5"/></svg>',
  ops: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg>',
  health: '<svg viewBox="0 0 24 24"><path d="M4 18V9M10 18V5M16 18v-7M22 18V3"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 1 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.4.4h.2a2 2 0 1 1 4 0v.2A2 2 0 0 0 17 2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21.2 8h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.8 3Z" transform="translate(1 1) scale(.92)"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>',
}

const nav = [['Overview','grid'],['Quotations','quotes'],['Customers','customers'],['Operations','ops'],['Deal health','health']]
const quotes = [
  { code:'Q-1048', customer:'Acme Corporation', detail:'24 × Latitude 7440 + setup', amount:'₹28,64,000', status:'Needs approval', type:'warn', date:'Today, 10:42 AM' },
  { code:'Q-1047', customer:'Northstar Labs', detail:'Annual software renewal', amount:'₹8,40,000', status:'Awaiting customer', type:'blue', date:'Yesterday' },
  { code:'Q-1046', customer:'Mosaic Retail', detail:'POS hardware rollout', amount:'₹14,20,500', status:'Approved', type:'green', date:'Aug 28, 2026' },
]

function icon(name) { return `<span class="icon">${icons[name]}</span>` }
function render() {
  document.querySelector('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">d</span><span>dealflow<span class="brand-number">360</span></span></div>
        <div class="workspace-switcher"><span class="workspace-dot"></span><span>Acme workspace</span>${icon('more')}</div>
        <div class="nav-label">Workspace</div>
        <nav>${nav.map(([label, key], i) => `<button class="nav-item ${i===0?'active':''}" data-nav="${label}">${icon(key)}<span>${label}</span>${label==='Quotations'?'<span class="nav-count">12</span>':''}</button>`).join('')}</nav>
        <div class="sidebar-bottom"><button class="nav-item">${icon('settings')}<span>Settings</span></button><div class="profile"><span class="avatar">AR</span><span><b>Ananya Rao</b><small>Sales operations</small></span>${icon('more')}</div></div>
      </aside>
      <main class="main">
        <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> Overview</div><div class="top-actions"><button class="icon-button">?</button><button class="notification"><span class="notification-dot"></span> ${icon('more')}</button><button class="mobile-menu">☰</button></div></header>
        <div class="content">
          <section class="page-heading"><div><p class="eyebrow">Friday, September 5, 2026</p><h1>Good morning, Ananya.</h1><p class="lede">Here’s what’s moving across your revenue pipeline.</p></div><button class="primary" id="new-quote">${icon('plus')} New quotation</button></section>
          <section class="metric-grid">
            <article class="metric-card"><div class="metric-label">Pipeline value <span class="trend positive">↗ 12.4%</span></div><div class="metric-value">₹1.84 Cr</div><div class="sparkline"><i style="height:28%"></i><i style="height:42%"></i><i style="height:35%"></i><i style="height:58%"></i><i style="height:51%"></i><i style="height:74%"></i><i style="height:68%"></i><i style="height:89%"></i></div><small>vs. ₹1.64 Cr last month</small></article>
            <article class="metric-card"><div class="metric-label">Open quotations <span class="trend positive">↗ 8.1%</span></div><div class="metric-value">24</div><div class="metric-foot"><span class="mini-dot yellow"></span> 8 need your attention</div></article>
            <article class="metric-card"><div class="metric-label">Win rate <span class="trend negative">↘ 2.6%</span></div><div class="metric-value">68.4%</div><div class="metric-foot"><span class="mini-dot green"></span> 4.2% above target</div></article>
          </section>
          <section class="main-grid">
            <article class="panel quote-panel"><div class="panel-header"><div><h2>Quotations needing attention</h2><p>Keep your deals moving forward.</p></div><button class="text-button" data-nav="Quotations">View all ${icon('arrow')}</button></div><div class="quote-list">${quotes.map(q => `<div class="quote-row"><div class="quote-avatar ${q.type}">${q.customer.split(' ').map(w=>w[0]).join('').slice(0,2)}</div><div class="quote-info"><b>${q.customer}</b><span>${q.code} · ${q.detail}</span></div><div class="quote-amount"><b>${q.amount}</b><span class="status ${q.type}">${q.status}</span></div><span class="date">${q.date}</span>${icon('more')}</div>`).join('')}</div></article>
            <article class="panel health-panel"><div class="panel-header"><div><h2>Deal health</h2><p>Signals from your active pipeline.</p></div><button class="text-button" data-nav="Deal health">Open ${icon('arrow')}</button></div><div class="health-score"><div class="score-ring"><strong>82</strong><small>/ 100</small></div><div><b>Healthy pipeline</b><p>Most deals are progressing<br/>without blockers.</p></div></div><div class="signal"><span class="signal-icon yellow">!</span><span><b>1 discount anomaly</b><small>Acme Corporation · Q-1048</small></span>${icon('arrow')}</div><div class="signal"><span class="signal-icon blue">↗</span><span><b>3 deals going quiet</b><small>No activity in the last 7 days</small></span>${icon('arrow')}</div></article>
          </section>
          <section class="lower-grid"><article class="panel activity-panel"><div class="panel-header"><div><h2>Pipeline activity</h2><p>Quotation value over the last 30 days.</p></div><button class="select">Last 30 days <span>⌄</span></button></div><div class="chart"><div class="y-labels"><span>₹60L</span><span>₹40L</span><span>₹20L</span><span>₹0</span></div><div class="chart-area"><div class="gridline one"></div><div class="gridline two"></div><div class="gridline three"></div><svg viewBox="0 0 620 180" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e4f222" stop-opacity=".3"/><stop offset="1" stop-color="#e4f222" stop-opacity="0"/></linearGradient></defs><path d="M0 142 C45 120 68 128 100 106 S148 115 175 84 S222 100 254 86 S292 91 320 63 S365 91 396 73 S440 58 462 68 S500 43 530 50 S570 30 620 22 V180 H0Z" fill="url(#fill)"/><path d="M0 142 C45 120 68 128 100 106 S148 115 175 84 S222 100 254 86 S292 91 320 63 S365 91 396 73 S440 58 462 68 S500 43 530 50 S570 30 620 22" fill="none" stroke="#17332d" stroke-width="3"/></svg><div class="x-labels"><span>Aug 7</span><span>Aug 14</span><span>Aug 21</span><span>Aug 28</span><span>Sep 5</span></div></div></div></article><article class="panel actions-panel"><div class="panel-header"><div><h2>Quick actions</h2><p>Common tasks, one click away.</p></div></div><button class="action-row" id="quick-quote"><span class="action-icon solar">${icon('plus')}</span><span><b>Create a quotation</b><small>Start from a customer or product</small></span>${icon('arrow')}</button><button class="action-row"><span class="action-icon dark">${icon('quotes')}</span><span><b>Review approvals</b><small>2 requests are waiting</small></span>${icon('arrow')}</button><button class="action-row"><span class="action-icon blue">${icon('health')}</span><span><b>Check fulfilment</b><small>4 orders in progress</small></span>${icon('arrow')}</button></article></section>
          <footer><span>DealFlow360</span><span>All systems operational <i class="online"></i></span><span>© 2026</span></footer>
        </div>
      </main>
    </div><div class="toast" id="toast">Quotation workspace opened</div>`
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => { document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.nav === el.dataset.nav)); showToast(`${el.dataset.nav} selected`) }))
  document.querySelectorAll('#new-quote, #quick-quote').forEach(el => el.addEventListener('click', () => showToast('New quotation flow is ready to connect')))
}
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400) }
render()
