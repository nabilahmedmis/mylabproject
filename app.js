
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const group = (list, key, val) => {
  const m = {};
  list.forEach(x => {
    const k = key(x);
    m[k] = (m[k] || 0) + val(x);
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const lines = S => S.flatMap(s => s.items);
const custName = id => (DB.customers.find(c => c.id === id) || {name: 'Unknown'}).name;
const isAdmin = () => session && session.role === 'admin';
const nextId = list => Math.max(0, ...list.map(x => x.id)) + 1;
const badge = s => isOverdue(s) ? '<span class="b bad">Overdue</span>'
  : `<span class="b ${{paid: 'ok', partial: 'warn', unpaid: 'bad'}[statusOf(s)]}">${statusOf(s)}</span>`;
const table = (heads, rows, empty = 'Nothing to show.', num = []) =>
  '<table><tr>' + heads.map((h, i) => `<th class="${num.includes(i) ? 'n' : ''}">${h}</th>`).join('') + '</tr>' +
  (rows.length ? rows.map(r => '<tr>' + r.map((c, i) => `<td class="${num.includes(i) ? 'n' : ''}">${c}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${heads.length}" class="muted">${empty}</td></tr>`) + '</table>';

function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.className = 'show';
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.className = '', 3000);
}

/* ================= Router ================= */
let PROD_OPTS = '';
let view = 'dashboard', viewArg = null, after = null, charts = [], trendChart = null;

const NAV = [
  ['dashboard', 'Dashboard'],
  ['newsale', 'New Sale'],
  ['invoices', 'Invoices'],
  ['customers', 'Customers'],
  ['products', 'Products'],
  ['reports', 'Reports'],
  ['users', 'Users & Logs', true]
];

const VIEWS = {
  dashboard: vDashboard,
  newsale: vNewSale,
  invoices: vInvoices,
  invoice: vInvoice,
  customers: vCustomers,
  customer: vCustomer,
  products: vProducts,
  reports: vReports,
  users: vUsers
};

function go(v, arg) {
  view = v;
  viewArg = arg;
  render();
  window.scrollTo(0, 0);
}

function render() {
  $('login').hidden = !!session;
  $('app').hidden = !session;

  if (!session) return;

  const parent = {invoice: 'invoices', customer: 'customers'}[view] || view;

  $('nav').innerHTML = NAV.filter(n => !n[2] || isAdmin())
    .map(n => `<a href="#" class="${parent === n[0] ? 'on' : ''}" onclick="go('${n[0]}');return false">${n[1]}</a>`)
    .join('');

  $('me').innerHTML = `${esc(session.name)} (${session.role})<br><a href="#" onclick="logout();return false">Log out</a>`;

  charts.forEach(c => c.destroy());
  if (trendChart) trendChart.destroy();

  charts = [];
  trendChart = null;
  after = null;

  $('content').innerHTML = VIEWS[view](viewArg);

  if (after) after();
}

/* ================= Login ================= */
function login(e) {
  e.preventDefault();

  const u = DB.users.find(x =>
    x.username === $('lu').value.trim() &&
    x.password === $('lp').value
  );

  if (!u) {
    $('lerr').textContent = 'Incorrect username or password.';
    return;
  }

  session = {
    user: u.username,
    name: u.name,
    role: u.role
  };

  sessionStorage.setItem('sd_session', JSON.stringify(session));

  $('lp').value = '';
  $('lerr').textContent = '';

  log('Logged in');
  go('dashboard');
}

function logout() {
  log('Logged out');
  session = null;
  sessionStorage.removeItem('sd_session');
  render();
}

/* ================= Dashboard ================= */
function trendData(k) {
  const S = DB.sales, L = [], V = [], t = new Date();

  if (k === 'daily') {
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      L.push(d.slice(5));
      V.push(sum(S.filter(s => s.date === d), s => s.total));
    }
  } else if (k === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const a = daysAgo(i * 7 + 6), b = daysAgo(i * 7);
      L.push(a.slice(5) + ' to ' + b.slice(5));
      V.push(sum(S.filter(s => s.date >= a && s.date <= b), s => s.total));
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const m = fmt(new Date(t.getFullYear(), t.getMonth() - i, 1)).slice(0, 7);
      L.push(m);
      V.push(sum(S.filter(s => s.date.startsWith(m)), s => s.total));
    }
  }

  return {L, V};
}

function drawTrend(k) {
  if (trendChart) trendChart.destroy();

  const d = trendData(k);

  trendChart = new Chart($('trend'), {
    type: k === 'monthly' ? 'bar' : 'line',
    data: {
      labels: d.L,
      datasets: [{
        label: 'Sales (Tk)',
        data: d.V,
        borderColor: '#c47a0a',
        backgroundColor: '#c47a0a88',
        tension: .3,
        fill: k !== 'monthly'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {display: false}
      }
    }
  });
}

function vDashboard() {
  const S = DB.sales, t = new Date();

  const rev = sum(S, s => s.total);
  const ord = S.length;
  const due = sum(S, dueOf);
  const low = DB.products.filter(p => p.stock <= p.min);

  const cm = today().slice(0, 7);
  const pm = fmt(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7);

  const cur = sum(S.filter(s => s.date.startsWith(cm)), s => s.total);
  const prev = sum(S.filter(s => s.date.startsWith(pm)), s => s.total);

  const target = DB.settings.target;
  const daysInMonth = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();

  // Smart alerts
  const alerts = [];

  low.forEach(p =>
    alerts.push(['bad', `Low stock: ${p.name} has ${p.stock} left (minimum ${p.min}).`])
  );

  S.filter(isOverdue).forEach(s =>
    alerts.push(['bad', `Overdue: ${custName(s.customerId)} owes ${money(dueOf(s))} on ${s.invoice} (due ${s.due}).`])
  );

  if (target > 0 && cur < target * t.getDate() / daysInMonth) {
    alerts.push(['warn', `Sales this month (${money(cur)}) are behind the pace for the ${money(target)} target.`]);
  }

  const wk = daysAgo(7);

  group(lines(S.filter(s => s.date >= wk)), i => i.pid, i => i.qty)
    .forEach(([pid, q]) => {
      const p = DB.products.find(x => x.id == pid);

      if (p && q >= p.stock) {
        alerts.push(['warn', `Fast seller: ${p.name} sold ${q} units in 7 days; only ${p.stock} left.`]);
      }
    });

  // Business insights
  const ins = [
    prev > 0
      ? `Sales ${cur >= prev ? 'increased' : 'decreased'} by ${Math.abs((cur - prev) / prev * 100).toFixed(1)}% compared with last month.`
      : 'There were no sales last month to compare with.'
  ];

  const tp = group(
    lines(S.filter(s => s.date.startsWith(cm))),
    i => i.name,
    i => i.qty * i.price
  )[0];

  if (tp) {
    ins.push(`${tp[0]} generated the highest revenue this month (${money(tp[1])}).`);
  }

  if (low.length) {
    ins.push(`${low.length} product${low.length > 1 ? 's are' : ' is'} at or below the minimum stock level.`);
  }

  ins.push(`Customers currently owe ${money(due)} across ${S.filter(s => dueOf(s) > 0).length} open invoices.`);

  const best = DB.customers
    .map(c => ({c, st: cStats(c)}))
    .sort((a, b) => b.st.spent - a.st.spent)
    .slice(0, 5);

  const topUnits = group(lines(S), i => i.name, i => i.qty).slice(0, 5);
  const cats = group(lines(S), i => i.cat, i => i.qty * i.price);

  after = () => {
    if (!window.Chart) {
      document.querySelectorAll('canvas').forEach(c =>
        c.replaceWith('Charts need an internet connection (Chart.js).')
      );
      return;
    }

    drawTrend('daily');

    const o = {
      responsive: true,
      maintainAspectRatio: false
    };

    charts.push(new Chart($('cats'), {
      type: 'doughnut',
      options: o,
      data: {
        labels: cats.map(x => x[0]),
        datasets: [{
          data: cats.map(x => x[1]),
          backgroundColor: ['#16302b', '#c47a0a', '#4f8f7a', '#d9b36c', '#8a9a94']
        }]
      }
    }));

    charts.push(new Chart($('top'), {
      type: 'bar',
      options: {
        ...o,
        indexAxis: 'y',
        plugins: {legend: {display: false}}
      },
      data: {
        labels: topUnits.map(x => x[0]),
        datasets: [{
          data: topUnits.map(x => x[1]),
          backgroundColor: '#4f8f7a'
        }]
      }
    }));
  };

  const kpi = (l, v, red) =>
    `<div class="card kpi ${red ? 'red' : ''}"><small>${l}</small><b>${v}</b></div>`;

  return `<h2>Business dashboard</h2>
  <div class="grid g3">
    ${kpi('Total revenue', money(rev))}
    ${kpi('Total orders', ord)}
    ${kpi('Total customers', DB.customers.length)}
    ${kpi('Average order value', money(ord ? rev / ord : 0))}
    ${kpi('Outstanding payments', money(due), 1)}
    ${kpi('Low-stock products', low.length, 1)}
  </div>

  <div class="grid g2">
    <div class="card">
      <h3>Smart alerts (${alerts.length})</h3>
      <ul class="al">
        ${alerts.map(a => `<li class="t-${a[0]}">${esc(a[1])}</li>`).join('') || '<li>No alerts. Everything looks healthy.</li>'}
      </ul>
    </div>

    <div class="card">
      <h3>Business insights</h3>
      <ul class="al">${ins.map(i => `<li>${esc(i)}</li>`).join('')}</ul>

      ${isAdmin() ? `<form class="filters" style="margin-top:12px" onsubmit="saveTarget(event)">
        <label>Monthly sales target (Tk)<input id="target" type="number" min="0" value="${target}"></label>
        <button class="btn alt">Save target</button>
      </form>` : ''}
    </div>
  </div>

  <div class="card">
    <h3>Sales trend</h3>
    <div class="tabs">
      <button class="btn alt" onclick="drawTrend('daily')">Daily</button>
      <button class="btn alt" onclick="drawTrend('weekly')">Weekly</button>
      <button class="btn alt" onclick="drawTrend('monthly')">Monthly</button>
    </div>
    <div class="chart"><canvas id="trend"></canvas></div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h3>Category contribution</h3>
      <div class="chart"><canvas id="cats"></canvas></div>
    </div>
    <div class="card">
      <h3>Top-selling products (units)</h3>
      <div class="chart"><canvas id="top"></canvas></div>
    </div>
  </div>

  <div class="card">
    <h3>Best customers</h3>
    ${table(['Customer', 'Orders', 'Total spent'], best.map(({c, st}) => [esc(c.name), st.orders, money(st.spent)]), '', [1, 2])}
  </div>`;
}

function saveTarget(e) {
  e.preventDefault();
  DB.settings.target = +$('target').value || 0;
  log('Changed sales target', DB.settings.target);
  toast('Target saved.');
  render();
}

/* ================= New sale ================= */
function vNewSale() {
  const opts = DB.products.map(p =>
    `<option value="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>${esc(p.name)} (stock ${p.stock}, ${money(p.price)})</option>`
  ).join('');

  PROD_OPTS = opts;
  after = addRow;

  return `<h2>Record a sale</h2>
  <form class="card" onsubmit="saveSale(event)">
    <div class="grid g3">
      <label>Customer<select id="cust" required>
        <option value="">Select customer</option>
        ${DB.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
      </select></label>

      <label>Sale date<input id="sdate" type="date" value="${today()}" required></label>
      <label>Payment due date<input id="ddate" type="date" value="${addDays(today(), 15)}" required></label>
    </div>

    <h3 style="margin-top:16px">Items</h3>
    <div id="rows"></div>

    <button type="button" class="btn alt" onclick="addRow()">+ Add product</button>

    <div class="totals">
      Subtotal: Tk <span id="sub">0.00</span><br>
      Total after discount: <b>Tk <span id="tot">0.00</span></b>
    </div>

    <div class="grid g3">
      <label>Discount (Tk)<input id="disc" type="number" min="0" step="0.01" value="0" oninput="calc()"></label>
      <label>Amount paid now (Tk)<input id="paid" type="number" min="0" step="0.01" value="0"></label>
      <label>Payment method<select id="method">
        <option value="cash">Cash</option>
        <option value="mobile">Mobile financial service</option>
        <option value="bank">Bank</option>
      </select></label>
    </div>

    <p><button class="btn">Save sale &amp; create invoice</button></p>
  </form>`;
}

function addRow() {
  const d = document.createElement('div');
  d.className = 'r';

  d.innerHTML = `<select required onchange="calc()">
    <option value="">Select product</option>${PROD_OPTS}
  </select>
  <input type="number" min="1" value="1" oninput="calc()">
  <span class="lt">0.00</span>
  <button type="button" class="btn del" onclick="this.parentNode.remove();calc()">&times;</button>`;

  $('rows').append(d);
}

function calc() {
  let s = 0;

  document.querySelectorAll('#rows .r').forEach(r => {
    const p = DB.products.find(x => x.id == r.querySelector('select').value);
    const t = (p ? p.price : 0) * (+r.querySelector('input').value || 0);

    r.querySelector('.lt').textContent = t.toFixed(2);
    s += t;
  });

  $('sub').textContent = s.toFixed(2);
  $('tot').textContent = Math.max(s - (+$('disc').value || 0), 0).toFixed(2);
}

function saveSale(e) {
  e.preventDefault();

  const need = {}, items = [];

  document.querySelectorAll('#rows .r').forEach(r => {
    const p = DB.products.find(x => x.id == r.querySelector('select').value);
    const q = +r.querySelector('input').value;

    if (!p || q < 1) return;

    need[p.id] = (need[p.id] || 0) + q;
    items.push({
      pid: p.id,
      name: p.name,
      cat: p.category,
      qty: q,
      price: p.price
    });
  });

  if (!items.length) return toast('Add at least one product.');

  for (const id in need) {
    const p = DB.products.find(x => x.id == id);
    if (p.stock < need[id]) return toast('Not enough stock for ' + p.name + '.');
  }

  const sub = sum(items, i => i.qty * i.price);
  const disc = Math.min(Math.max(+$('disc').value || 0, 0), sub);
  const total = sub - disc;
  const paid = Math.min(Math.max(+$('paid').value || 0, 0), total);

  for (const id in need) {
    DB.products.find(x => x.id == id).stock -= need[id];
  }

  const id = nextId(DB.sales);

  DB.sales.push({
    id,
    invoice: 'INV-' + new Date().getFullYear() + '-' + String(id).padStart(5, '0'),
    customerId: +$('cust').value,
    user: session.user,
    date: $('sdate').value,
    due: $('ddate').value,
    items,
    discount: disc,
    total,
    payments: paid ? [{amount: paid, method: $('method').value, date: today()}] : []
  });

  log('Recorded sale', 'Invoice ' + id);
  go('invoice', id);
}

/* ================= Invoices ================= */
let invF = {s: '', status: '', from: '', to: ''};

function vInvoices() {
  after = invTable;

  return `<h2>Invoices</h2>
  <div class="card filters">
    <label>Search invoice or customer<input value="${esc(invF.s)}" oninput="invF.s=this.value;invTable()"></label>

    <label>Status<select onchange="invF.status=this.value;invTable()">
      ${['', 'paid', 'partial', 'unpaid', 'overdue'].map(x =>
        `<option value="${x}" ${invF.status === x ? 'selected' : ''}>${x || 'All'}</option>`
      ).join('')}
    </select></label>

    <label>From<input type="date" value="${invF.from}" onchange="invF.from=this.value;invTable()"></label>
    <label>To<input type="date" value="${invF.to}" onchange="invF.to=this.value;invTable()"></label>
  </div>

  <div class="card" id="tbl"></div>`;
}

function invTable() {
  const f = invF, q = f.s.toLowerCase();

  const L = DB.sales.filter(s =>
    (!q || s.invoice.toLowerCase().includes(q) || custName(s.customerId).toLowerCase().includes(q)) &&
    (!f.status || (f.status === 'overdue' ? isOverdue(s) : statusOf(s) === f.status)) &&
    (!f.from || s.date >= f.from) &&
    (!f.to || s.date <= f.to)
  ).sort((a, b) => b.id - a.id);

  $('tbl').innerHTML = table(
    ['Invoice', 'Date', 'Customer', 'Entered by', 'Total', 'Paid', 'Due', 'Status', ''],
    L.map(s => [
      esc(s.invoice),
      s.date,
      esc(custName(s.customerId)),
      esc(s.user),
      money(s.total),
      money(paidOf(s)),
      money(dueOf(s)),
      badge(s),
      `<a href="#" onclick="go('invoice',${s.id});return false">Open</a>`
    ]),
    'No invoices match.',
    [4, 5, 6]
  );
}

function vInvoice(id) {
  const s = DB.sales.find(x => x.id === id);
  if (!s) return '<p>Invoice not found.</p>';

  const c = DB.customers.find(x => x.id === s.customerId) || {};
  const due = dueOf(s);
  const sub = sum(s.items, i => i.qty * i.price);

  return `<div class="card receipt">
    <div class="head">
      <div>
        <h2>${esc(s.invoice)}</h2>
        <span class="muted">Date: ${s.date} | Staff: ${esc(s.user)}</span>
      </div>
      <div>${badge(s)}</div>
    </div>

    <p><b>${esc(c.name)}</b><br>${esc(c.phone)} ${esc(c.address)}</p>

    ${table(['Product', 'Qty', 'Unit price', 'Amount'], [
      ...s.items.map(i => [esc(i.name), i.qty, money(i.price), money(i.qty * i.price)]),
      ['', '', 'Subtotal', money(sub)],
      ['', '', 'Discount', '- ' + money(s.discount)],
      ['', '', '<b>Total</b>', '<b>' + money(s.total) + '</b>'],
      ['', '', 'Paid', money(paidOf(s))],
      ['', '', '<b>Balance due</b>', '<b>' + money(due) + '</b>']
    ], '', [1, 2, 3])}

    <h3 style="margin-top:16px">Payments</h3>
    ${s.payments.map(p => `<div>${p.date} - ${money(p.amount)} (${p.method})</div>`).join('') || '<div class="muted">No payments yet.</div>'}

    ${due > 0 ? `<div class="muted">Payment due by ${s.due}</div>` : ''}
  </div>

  <div class="noprint">
    <button class="btn" onclick="window.print()">Print receipt</button>
    <button class="btn alt" onclick="go('invoices')">Back to invoices</button>

    ${due > 0 ? `<form class="card filters" style="margin-top:16px" onsubmit="receivePayment(event,${s.id})">
      <label>Receive payment (Tk)<input id="pamt" type="number" step="0.01" min="0.01" max="${due}" value="${due}" required></label>
      <label>Method<select id="pm">
        <option value="cash">Cash</option>
        <option value="mobile">Mobile financial service</option>
        <option value="bank">Bank</option>
      </select></label>
      <button class="btn">Record payment</button>
    </form>` : ''}
  </div>`;
}

function receivePayment(e, id) {
  e.preventDefault();

  const s = DB.sales.find(x => x.id === id);
  const a = Math.min(+$('pamt').value, dueOf(s));

  if (a > 0) {
    s.payments.push({
      amount: a,
      method: $('pm').value,
      date: today()
    });

    log('Payment received', s.invoice + ' ' + a);
    toast('Payment recorded.');
  }

  go('invoice', id);
}

/* ================= Customers (CRM) ================= */
let cuF = {s: '', seg: ''}, editC = null;

function cStats(c) {
  const S = DB.sales.filter(s => s.customerId === c.id);

  return {
    orders: S.length,
    spent: sum(S, s => s.total),
    due: sum(S, dueOf),
    last: S.length ? S.map(s => s.date).sort().pop() : null
  };
}

function segment(c, st) {
  const age = daysBetween(c.created, today());
  const idle = st.last ? daysBetween(st.last, today()) : age;

  if (idle > 60) return 'Inactive';
  if (st.orders <= 1 && age <= 30) return 'New';

  return 'Regular';
}

function vCustomers() {
  const c = editC ? DB.customers.find(x => x.id === editC) : {};
  after = cuTable;

  return `<h2>Customers</h2>
  <form class="card" onsubmit="saveCustomer(event)">
    <h3>${editC ? 'Edit' : 'Add'} customer</h3>

    <div class="grid g3">
      <label>Name<input id="cname" required value="${esc(c.name)}"></label>
      <label>Phone<input id="cphone" value="${esc(c.phone)}"></label>
      <label>Email<input id="cemail" type="email" value="${esc(c.email)}"></label>
      <label>Address<input id="caddr" value="${esc(c.address)}"></label>
      <label>Notes<input id="cnotes" value="${esc(c.notes)}"></label>
    </div>

    <p>
      <button class="btn">${editC ? 'Update' : 'Save'} customer</button>
      ${editC ? ` <button type="button" class="btn alt" onclick="editC=null;go('customers')">Cancel</button>` : ''}
    </p>
  </form>

  <div class="card filters">
    <label>Search name or phone<input value="${esc(cuF.s)}" oninput="cuF.s=this.value;cuTable()"></label>

    <label>Segment<select onchange="cuF.seg=this.value;cuTable()">
      ${['', 'New', 'Regular', 'Inactive'].map(x =>
        `<option value="${x}" ${cuF.seg === x ? 'selected' : ''}>${x || 'All'}</option>`
      ).join('')}
    </select></label>
  </div>

  <div class="card" id="tbl"></div>`;
}

function cuTable() {
  const q = cuF.s.toLowerCase();

  const L = DB.customers.map(c => {
    const st = cStats(c);
    return {c, st, sg: segment(c, st)};
  })
    .filter(x =>
      (!q || x.c.name.toLowerCase().includes(q) || (x.c.phone || '').includes(q)) &&
      (!cuF.seg || x.sg === cuF.seg)
    )
    .sort((a, b) => b.st.spent - a.st.spent);

  $('tbl').innerHTML = table(
    ['Customer', 'Phone', 'Segment', 'Orders', 'Spent', 'Due', 'Last purchase', ''],
    L.map(({c, st, sg}) => [
      `<b>${esc(c.name)}</b><br><span class="muted">${esc(c.notes)}</span>`,
      esc(c.phone),
      `<span class="b ${sg === 'Inactive' ? 'bad' : sg === 'New' ? 'warn' : 'ok'}">${sg}</span>${st.orders >= FREQUENT ? ' <span class="b">Frequent</span>' : ''}${st.spent >= HIGH_VALUE ? ' <span class="b">High value</span>' : ''}`,
      st.orders,
      money(st.spent),
      money(st.due),
      st.last || '-',
      `<a href="#" onclick="go('customer',${c.id});return false">History</a> | <a href="#" onclick="editC=${c.id};go('customers');return false">Edit</a>` +
      (isAdmin() ? ` | <a href="#" class="t-bad" onclick="delCustomer(${c.id});return false">Delete</a>` : '')
    ]),
    'No customers found.',
    [3, 4, 5]
  );
}

function saveCustomer(e) {
  e.preventDefault();

  const d = {
    name: $('cname').value.trim(),
    phone: $('cphone').value.trim(),
    email: $('cemail').value.trim(),
    address: $('caddr').value.trim(),
    notes: $('cnotes').value.trim()
  };

  if (editC) {
    Object.assign(DB.customers.find(x => x.id === editC), d);
    log('Updated customer', d.name);
    toast('Customer updated.');
  } else {
    DB.customers.push({
      id: nextId(DB.customers),
      ...d,
      created: today()
    });
    log('Added customer', d.name);
    toast('Customer added.');
  }

  editC = null;
  go('customers');
}

function delCustomer(id) {
  if (DB.sales.some(s => s.customerId === id)) {
    return toast('Cannot delete: this customer has sales records.');
  }

  if (!confirm('Delete this customer?')) return;

  DB.customers = DB.customers.filter(c => c.id !== id);
  log('Deleted customer', 'ID ' + id);
  toast('Customer deleted.');
  render();
}

function vCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  const st = cStats(c);
  const S = DB.sales.filter(s => s.customerId === id).sort((a, b) => b.id - a.id);

  return `<h2>${esc(c.name)}</h2>
  <div class="card">
    ${esc(c.phone)} | ${esc(c.email)} | ${esc(c.address)}<br>
    <span class="muted">Notes: ${esc(c.notes) || 'None'}</span><br>
    Orders: <b>${st.orders}</b> |
    Total spent: <b>${money(st.spent)}</b> |
    Outstanding: <b>${money(st.due)}</b> |
    Segment: <b>${segment(c, st)}</b>
  </div>

  <div class="card">
    <h3>Purchase history</h3>
    ${table(['Invoice', 'Date', 'Total', 'Due', 'Status'],
      S.map(s => [
        `<a href="#" onclick="go('invoice',${s.id});return false">${esc(s.invoice)}</a>`,
        s.date,
        money(s.total),
        money(dueOf(s)),
        badge(s)
      ]),
      'No purchases yet.',
      [2, 3]
    )}
  </div>

  <button class="btn alt" onclick="go('customers')">Back to customers</button>`;
}

/* ================= Products & inventory ================= */
let prF = {s: '', c: ''}, editP = null;

function vProducts() {
  const p = editP ? DB.products.find(x => x.id === editP) : {};
  const cats = [...new Set(DB.products.map(x => x.category))].sort();

  after = prTable;

  return `<h2>Products &amp; inventory</h2>
  ${isAdmin() ? `<form class="card" onsubmit="saveProduct(event)">
    <h3>${editP ? 'Edit' : 'Add'} product</h3>

    <div class="grid g3">
      <label>Name<input id="pname" required value="${esc(p.name)}"></label>
      <label>Category<input id="pcat" list="cats" required value="${esc(p.category)}">
        <datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      </label>
      <label>Price (Tk)<input id="pprice" type="number" min="0" step="0.01" required value="${p.price ?? ''}"></label>
      <label>Stock quantity<input id="pstock" type="number" min="0" required value="${p.stock ?? 0}"></label>
      <label>Minimum stock level<input id="pmin" type="number" min="0" required value="${p.min ?? 5}"></label>
    </div>

    <p>
      <button class="btn">${editP ? 'Update' : 'Save'} product</button>
      ${editP ? ` <button type="button" class="btn alt" onclick="editP=null;go('products')">Cancel</button>` : ''}
    </p>
  </form>` : ''}

  <div class="card filters">
    <label>Search product<input value="${esc(prF.s)}" oninput="prF.s=this.value;prTable()"></label>

    <label>Category<select onchange="prF.c=this.value;prTable()">
      <option value="">All</option>
      ${cats.map(c => `<option ${prF.c === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
    </select></label>
  </div>

  <div class="card" id="tbl"></div>`;
}

function prTable() {
  const q = prF.s.toLowerCase();

  const L = DB.products
    .filter(p =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (!prF.c || p.category === prF.c)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  $('tbl').innerHTML = table(
    ['Product', 'Category', 'Price', 'Stock', 'Minimum', 'Status', ...(isAdmin() ? [''] : [])],
    L.map(p => [
      esc(p.name),
      esc(p.category),
      money(p.price),
      p.stock,
      p.min,
      `<span class="b ${p.stock <= p.min ? 'bad' : 'ok'}">${p.stock <= p.min ? 'Low stock' : 'In stock'}</span>`,
      ...(isAdmin() ? [
        `<a href="#" onclick="editP=${p.id};go('products');return false">Edit</a> | <a href="#" class="t-bad" onclick="delProduct(${p.id});return false">Delete</a>`
      ] : [])
    ]),
    'No products found.',
    [2, 3, 4]
  );
}

function saveProduct(e) {
  e.preventDefault();
  if (!isAdmin()) return;

  const d = {
    name: $('pname').value.trim(),
    category: $('pcat').value.trim(),
    price: +$('pprice').value,
    stock: +$('pstock').value,
    min: +$('pmin').value
  };

  if (editP) {
    Object.assign(DB.products.find(x => x.id === editP), d);
    log('Updated product', d.name);
    toast('Product updated.');
  } else {
    DB.products.push({
      id: nextId(DB.products),
      ...d
    });
    log('Added product', d.name);
    toast('Product added.');
  }

  editP = null;
  go('products');
}

function delProduct(id) {
  if (DB.sales.some(s => s.items.some(i => i.pid === id))) {
    return toast('Cannot delete: this product appears in sales.');
  }

  if (!confirm('Delete this product?')) return;

  DB.products = DB.products.filter(p => p.id !== id);
  log('Deleted product', 'ID ' + id);
  toast('Product deleted.');
  render();
}

/* ================= Reports ================= */
let rep = {
  from: daysAgo(90),
  to: today(),
  pid: '',
  cid: ''
};

function repSales() {
  return DB.sales.filter(s =>
    s.date >= rep.from &&
    s.date <= rep.to &&
    (!rep.cid || s.customerId == rep.cid) &&
    (!rep.pid || s.items.some(i => i.pid == rep.pid))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function vReports() {
  after = repRender;

  return `<h2>Reports</h2>
  <div class="card filters">
    <label>From<input type="date" value="${rep.from}" onchange="rep.from=this.value;repRender()"></label>
    <label>To<input type="date" value="${rep.to}" onchange="rep.to=this.value;repRender()"></label>

    <label>Product<select onchange="rep.pid=this.value;repRender()">
      <option value="">All</option>
      ${DB.products.map(p => `<option value="${p.id}" ${rep.pid == p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select></label>

    <label>Customer<select onchange="rep.cid=this.value;repRender()">
      <option value="">All</option>
      ${DB.customers.map(c => `<option value="${c.id}" ${rep.cid == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
    </select></label>

    <button class="btn alt" onclick="exportCSV()">Export CSV</button>
    <button class="btn alt" onclick="window.print()">Print report</button>
  </div>

  <div id="rep"></div>`;
}

function repRender() {
  const L = repSales();
  const rev = sum(L, s => s.total);
  const paid = sum(L, paidOf);

  const ln = lines(L).filter(i => !rep.pid || i.pid == rep.pid);
  const lineRev = sum(ln, i => i.qty * i.price);
  const months = [...new Set(L.map(s => s.date.slice(0, 7)))].sort().reverse();

  const kpi = (l, v, red) =>
    `<div class="card kpi ${red ? 'red' : ''}"><small>${l}</small><b>${v}</b></div>`;

  const bestC = group(L, s => custName(s.customerId), s => s.total).slice(0, 5);

  $('rep').innerHTML = `<h3>Sales report: ${rep.from} to ${rep.to}</h3>
  <div class="grid g3">
    ${kpi('Revenue', money(rev))}
    ${kpi('Orders', L.length)}
    ${kpi('Discounts given', money(sum(L, s => s.discount)))}
    ${kpi('Collected', money(paid))}
    ${kpi('Outstanding dues', money(rev - paid), 1)}
  </div>

  <div class="card">
    <h3>Monthly sales summary</h3>
    ${table(['Month', 'Orders', 'Discount', 'Revenue', 'Collected', 'Due'],
      months.map(m => {
        const M = L.filter(s => s.date.startsWith(m));
        return [
          m,
          M.length,
          money(sum(M, s => s.discount)),
          money(sum(M, s => s.total)),
          money(sum(M, paidOf)),
          money(sum(M, dueOf))
        ];
      }),
      'No sales in this period.',
      [1, 2, 3, 4, 5]
    )}
  </div>

  <div class="grid g2">
    <div class="card">
      <h3>Top-selling products</h3>
      ${table(['Product', 'Units', 'Revenue'],
        group(ln, i => i.name, i => i.qty * i.price).slice(0, 10)
          .map(([n, r]) => [
            esc(n),
            sum(ln.filter(i => i.name === n), i => i.qty),
            money(r)
          ]),
        '',
        [1, 2]
      )}
    </div>

    <div class="card">
      <h3>Category contribution</h3>
      ${table(['Category', 'Revenue', 'Share'],
        group(ln, i => i.cat, i => i.qty * i.price)
          .map(([n, r]) => [
            esc(n),
            money(r),
            (lineRev ? r / lineRev * 100 : 0).toFixed(1) + '%'
          ]),
        '',
        [1, 2]
      )}
    </div>
  </div>

  <div class="card">
    <h3>Best customers</h3>
    ${table(['Customer', 'Total'], bestC.map(([n, t]) => [esc(n), money(t)]), '', [1])}
  </div>

  <div class="card">
    <h3>Sales records</h3>
    ${table(['Invoice', 'Date', 'Customer', 'Staff', 'Total', 'Due', 'Status'],
      L.map(s => [
        esc(s.invoice),
        s.date,
        esc(custName(s.customerId)),
        esc(s.user),
        money(s.total),
        money(dueOf(s)),
        badge(s)
      ]),
      'No sales in this period.',
      [4, 5]
    )}
  </div>`;
}

function exportCSV() {
  const rows = [
    ['Invoice', 'Date', 'Customer', 'Staff', 'Total', 'Paid', 'Due', 'Status'],
    ...repSales().map(s => [
      s.invoice,
      s.date,
      custName(s.customerId),
      s.user,
      s.total,
      paidOf(s),
      dueOf(s),
      statusOf(s)
    ])
  ];

  const csv = rows.map(r =>
    r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
  ).join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = 'sales_' + today() + '.csv';
  a.click();

  log('Exported sales CSV');
}

/* ================= Users & activity log (admin) ================= */
function vUsers() {
  const cnt = u => DB.sales.filter(s => s.user === u).length;

  return `<h2>Users &amp; activity log</h2>
  <form class="card" onsubmit="saveUser(event)">
    <h3>Add user</h3>

    <div class="grid g3">
      <label>Full name<input id="ufull" required></label>
      <label>Username<input id="uname" required></label>
      <label>Password (min 6)<input id="upass" type="password" minlength="6" required></label>
      <label>Role<select id="urole">
        <option value="staff">Sales staff</option>
        <option value="admin">Admin</option>
      </select></label>
    </div>

    <p><button class="btn">Create user</button></p>
  </form>

  <div class="card">
    <h3>Users</h3>
    ${table(['Name', 'Username', 'Role', 'Sales entered', ''],
      DB.users.map(u => [
        esc(u.name),
        esc(u.username),
        u.role,
        cnt(u.username),
        u.username === session.user ? '' : `<a href="#" class="t-bad" onclick="delUser('${esc(u.username)}');return false">Delete</a>`
      ]),
      '',
      [3]
    )}
  </div>

  <div class="card">
    <h3>Recent activity</h3>
    ${table(['Time', 'User', 'Action', 'Details'],
      DB.logs.slice(0, 50).map(l => [
        esc(l.time),
        esc(l.user),
        esc(l.action),
        esc(l.details)
      ]),
      'No activity yet.'
    )}
  </div>

  <button class="btn alt" onclick="resetData()">Reset to sample data</button>`;
}

function saveUser(e) {
  e.preventDefault();

  const u = $('uname').value.trim();

  if (DB.users.some(x => x.username === u)) {
    return toast('That username already exists.');
  }

  DB.users.push({
    username: u,
    name: $('ufull').value.trim(),
    password: $('upass').value,
    role: $('urole').value
  });

  log('Created user', u);
  toast('User created.');
  render();
}

function delUser(u) {
  if (DB.sales.some(s => s.user === u)) {
    return toast('Cannot delete: this user has recorded sales.');
  }

  if (!confirm('Delete this user?')) return;

  DB.users = DB.users.filter(x => x.username !== u);
  log('Deleted user', u);
  render();
}

function resetData() {
  if (!confirm('Erase all data and restore the sample data?')) return;

  DB = seed();
  save();
  toast('Sample data restored.');
  render();
}

/* ================= Start ================= */
render();