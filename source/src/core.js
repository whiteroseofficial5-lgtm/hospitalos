/* ===== core: state, permissions, helpers, shell ===== */
let db = null, session = null, route = { m:'dashboard', p:{} };
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = n => '\u20B9' + (Math.round((n||0)*100)/100).toLocaleString('en-IN', { minimumFractionDigits:0, maximumFractionDigits:2 });
const fdate = s => { if (!s) return '-'; const d = new Date(s.length<=10 ? s+'T00:00:00' : s); return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); };
const age = dob => { const d = new Date(dob), n = new Date(); let a = n.getFullYear()-d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const byId = (arr, id) => arr.find(x => x.id === id);
const P = id => byId(db.patients, id) || { name:'Unknown', id };
const DOC = id => byId(db.doctors, id) || { name:'Unknown' };
const deptName = id => (byId(db.departments, id) || {}).name || '';
const BED = id => byId(db.beds, id) || { id, label:id, ward:'' };
const bedName = id => { const b = BED(id); const w = byId(db.wards, b.ward); return (w ? w.name + ' / ' : '') + b.label; };
const sc = { Paid:'ok', Verified:'ok', Completed:'ok', Dispensed:'ok', Discharged:'ok', Received:'ok', free:'ok', Partial:'warn', Processing:'warn', 'Sample collected':'warn', 'Checked-in':'info', 'In consultation':'info', Resulted:'info', Ordered:'info', Booked:'teal', Admitted:'teal', Pending:'bad', occupied:'bad', Cancelled:'bad', maintenance:'', Refunded:'warn' };
const badge = s => `<span class="badge ${sc[s] || ''}">${esc(s)}</span>`;
class VErr extends Error { constructor(m){ super(m); this.name = 'ValidationError'; } }

function load() { try { const s = localStorage.getItem(STORE_KEY); if (s) { const d = JSON.parse(s); if (d && d.v === 1) return d; } } catch (e) {} return buildSeed(); }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) {} }
function audit(action, detail) { db.audit.unshift({ at:new Date().toISOString(), user:session ? session.name : 'System', role:session ? session.role : 'system', action, detail:detail || '' }); if (db.audit.length > 400) db.audit.length = 400; }

/* ---- permissions: one central guard used by every action ---- */
const MODS = [
  { id:'dashboard',    label:'Dashboard',        roles:'*', icon:'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { id:'patients',     label:'Patients',         roles:['admin','reception','doctor','nurse'], icon:'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6' },
  { id:'appointments', label:'Appointments',     roles:['admin','reception','doctor','nurse'], icon:'M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 011 1v14H4V6a1 1 0 011-1z' },
  { id:'opd',          label:'OPD and consultations', roles:['admin','doctor','nurse'], icon:'M12 3v18M3 12h18' },
  { id:'ipd',          label:'IPD and beds',     roles:['admin','reception','doctor','nurse'], icon:'M3 18v-8h18v8M3 14h18M6 10V7h5v3' },
  { id:'lab',          label:'Laboratory',       roles:['admin','doctor','lab'], icon:'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3' },
  { id:'pharmacy',     label:'Pharmacy',         roles:['admin','pharmacist'], icon:'M8 8l8 8M5 11a4 4 0 010-6l1-1a4 4 0 016 0l7 7a4 4 0 010 6l-1 1a4 4 0 01-6 0z' },
  { id:'inventory',    label:'Inventory',        roles:['admin','inventory'], icon:'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10' },
  { id:'billing',      label:'Billing',          roles:['admin','accountant','reception'], icon:'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6' },
  { id:'reports',      label:'Reports',          roles:['admin','accountant'], icon:'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id:'staff',        label:'Doctors and staff', roles:['admin'], icon:'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z' },
  { id:'audit',        label:'Audit log',        roles:['admin'], icon:'M6 3h9l3 3v15H6zM9 11h6M9 15h6' },
];
const PERM = {
  'patient.create':['admin','reception'], 'appt.book':['admin','reception'], 'appt.checkin':['admin','reception','nurse'], 'appt.cancel':['admin','reception'],
  'vitals':['admin','doctor','nurse'], 'consult':['admin','doctor'], 'lab.order':['admin','doctor'], 'lab.process':['admin','lab'], 'lab.verify':['admin','lab'],
  'rx.dispense':['admin','pharmacist'], 'pharm.stock':['admin','pharmacist'], 'inv.manage':['admin','inventory'],
  'bill.create':['admin','accountant','reception'], 'bill.pay':['admin','accountant','reception'], 'bill.refund':['admin','accountant'],
  'ipd.admit':['admin','reception','doctor'], 'ipd.transfer':['admin','doctor','nurse'], 'ipd.discharge':['admin','doctor'], 'staff.manage':['admin'], 'demo.reset':['admin'],
};
const canMod = id => { const m = MODS.find(x => x.id === id); return !!session && !!m && (m.roles === '*' || m.roles.includes(session.role)); };
const can = a => !!session && (PERM[a] || []).includes(session.role);
function need(a) { if (!can(a)) { audit('Access denied', a); toast('Your role (' + ROLES[session.role].short + ') is not allowed to do this.', 'err'); throw new VErr('forbidden'); } }
function needMod(m) { if (!canMod(m)) { toast('Your role is not allowed to open this module.', 'err'); throw new VErr('forbidden'); } }

/* ---- action registry: every handler runs through one wrapper ---- */
const A = {};
function def(name, fn) { A[name] = (...args) => { try { fn(...args); } catch (e) { if (e.name === 'ValidationError') { if (e.message !== 'forbidden') toast(e.message, 'err'); } else { console.error(e); toast('Something went wrong: ' + e.message, 'err'); } } }; }

/* ---- ui helpers ---- */
function toast(msg, kind) { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 5200 : 3200); }
function openModal(o) {
  closeModal();
  const m = document.createElement('div'); m.id = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="dlg ${o.wide ? 'wide' : ''}"><div class="dh"><h2>${esc(o.title)}</h2><button class="btn s" onclick="closeModal()" aria-label="Close">Close</button></div><div class="db">${o.body}</div>${o.footer ? `<div class="df">${o.footer}</div>` : ''}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  const f = m.querySelector('input,select,textarea'); if (f && !o.noFocus) f.focus();
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const fv = id => { const out = {}; const root = document.getElementById(id); if (!root) return out; root.querySelectorAll('[name]').forEach(el => { if (el.type === 'checkbox') { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.value.trim(); }); return out; };
const opt = (arr, val, label, sel) => arr.map(x => `<option value="${esc(val(x))}" ${sel === val(x) ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
const field = (label, inner, cls) => `<label class="${cls || ''}">${esc(label)}${inner}</label>`;
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${esc(s || '')}</div>`;
const table = (cols, rows, emptyT, emptyS) => rows.length ? `<div class="tw"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(emptyT || 'Nothing here yet', emptyS);
const pLink = id => `<a href="#" onclick="A.openPatient('${id}');return false">${esc(P(id).name)}</a><div class="sm mut mono">${esc(id)}</div>`;
function tabs(list, cur, fn) { return `<div class="tabs" role="tablist">${list.map(t => `<button role="tab" class="${cur === t[0] ? 'on' : ''}" onclick="${fn}('${t[0]}')">${esc(t[1])}</button>`).join('')}</div>`; }
function patientOptions(sel) { return `<option value="">Select patient</option>` + opt(db.patients, p => p.id, p => p.id + '  ' + p.name, sel); }

/* ---- qr + csv + print ---- */
function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ scalable:true, margin:0, cellSize:4 }); }
const patientQR = p => 'WR://patient/' + p.id + '?k=' + p.token;
function downloadCSV(name, cols, rows) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = [cols, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type:'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
const docHead = t => `<div class="dh2"><div><h2>${esc(db.hospital.name)}</h2><div class="sm">${esc(db.hospital.address)}<br>${esc(db.hospital.phone)} | ${esc(db.hospital.id)}</div></div><div class="r"><b style="font-size:16px">${esc(t)}</b><div class="sm">Printed ${fdate(todayStr())}</div><div class="sm" style="color:#a36200">DEMO DOCUMENT</div></div></div>`;
const docFoot = `<div class="watermark">Generated by WhiteRose HospitalOS (demo). All data is fictional. Software by WhiteRose - Cybersecurity and Software Development.</div>`;
function showDoc(title, html, wide) { openModal({ title, wide:wide !== false, noFocus:true, body:`<div class="doc">${html}${docFoot}</div>`, footer:`<button class="btn p" onclick="window.print()">Print / Save as PDF</button><button class="btn" onclick="closeModal()">Close</button>` }); }

/* ---- charts (inline svg, no libraries) ---- */
function barChart(data, o) {
  o = o || {}; const w = 520, h = 190, pl = 34, pb = 26, pt = 10; const max = Math.max(1, ...data.map(d => d.v)); const bw = (w - pl) / data.length;
  const ticks = [0, .5, 1].map(f => { const y = pt + (h - pb - pt) * (1 - f); return `<line x1="${pl}" x2="${w}" y1="${y}" y2="${y}" stroke="#e3e8ee"/><text x="${pl - 5}" y="${y + 3}" text-anchor="end">${o.fmt ? o.fmt(max * f) : Math.round(max * f)}</text>`; }).join('');
  const bars = data.map((d, i) => { const bh = (h - pb - pt) * d.v / max; const x = pl + i * bw + bw * .2; return `<rect x="${x}" y="${h - pb - bh}" width="${bw * .6}" height="${bh}" rx="3" fill="${d.c || o.color || '#0f9b8e'}"><title>${esc(d.l)}: ${o.fmt ? o.fmt(d.v) : d.v}</title></rect><text x="${x + bw * .3}" y="${h - 9}" text-anchor="middle">${esc(d.l)}</text>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'chart')}">${ticks}${bars}</svg>`;
}
function lineChart(series, labels, o) {
  o = o || {}; const w = 520, h = 190, pl = 40, pb = 26, pt = 10; const max = Math.max(1, ...series.flatMap(s => s.v)); const step = (w - pl - 10) / Math.max(1, labels.length - 1);
  const ticks = [0, .5, 1].map(f => { const y = pt + (h - pb - pt) * (1 - f); return `<line x1="${pl}" x2="${w}" y1="${y}" y2="${y}" stroke="#e3e8ee"/><text x="${pl - 5}" y="${y + 3}" text-anchor="end">${o.fmt ? o.fmt(max * f) : Math.round(max * f)}</text>`; }).join('');
  const lines = series.map(s => { const pts = s.v.map((v, i) => [pl + i * step, pt + (h - pb - pt) * (1 - v / max)]); return `<polyline fill="none" stroke="${s.c}" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${s.c}"><title>${esc(labels[i])}: ${o.fmt ? o.fmt(s.v[i]) : s.v[i]}</title></circle>`).join(''); }).join('');
  const xl = labels.map((l, i) => `<text x="${pl + i * step}" y="${h - 9}" text-anchor="middle">${esc(l)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'chart')}">${ticks}${lines}${xl}</svg>`;
}

/* ---- derived numbers shared by dashboard / reports ---- */
const net = i => i.total - (i.discount || 0);
const balance = i => Math.max(0, net(i) - i.paid + i.refunded);
function refreshInvoice(i) { const b = balance(i); const received = i.paid - i.refunded; i.status = net(i) > 0 && b <= 0 ? 'Paid' : received > 0 ? 'Partial' : 'Pending'; }
const medStock = id => sum(db.batches.filter(b => b.med === id && b.expiry >= todayStr()), b => b.qty);
const lowMeds = () => db.medicines.filter(m => medStock(m.id) <= m.reorder);
const expiring = days => db.batches.filter(b => b.qty > 0 && b.expiry <= addDays(days));
const collectionsOn = d => sum(db.payments.filter(p => p.at === d), p => p.type === 'refund' ? -p.amount : p.amount);
const activeAdm = () => db.admissions.filter(a => a.status === 'Admitted');
function alerts() {
  const a = [];
  lowMeds().forEach(m => a.push({ k:'warn', t:'Low stock: ' + m.name + ' (' + medStock(m.id) + ' left, reorder at ' + m.reorder + ')', go:'pharmacy' }));
  expiring(30).forEach(b => a.push({ k:'bad', t:(b.expiry < todayStr() ? 'Expired' : 'Expires soon') + ': ' + byId(db.medicines, b.med).name + ' batch ' + b.batchNo + ' (' + fdate(b.expiry) + ')', go:'pharmacy' }));
  db.items.filter(i => i.qty <= i.min).forEach(i => a.push({ k:'warn', t:'Supply below minimum: ' + i.name + ' (' + i.qty + ' ' + i.unit + ')', go:'inventory' }));
  const pl = db.labOrders.filter(l => l.status !== 'Verified').length; if (pl) a.push({ k:'info', t:pl + ' laboratory orders are not verified yet', go:'lab' });
  return a;
}

/* ---- shell ---- */
const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const roseSvg = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" stroke="${c || '#fff'}" stroke-width="2" aria-hidden="true"><circle cx="24" cy="24" r="21" stroke-dasharray="3 2.4"/><path d="M24 15c-4 0-7 3-7 6.5 0 4 3 7 7 7s7-3 7-7c0-3-2-5-5-5-2.5 0-4.2 1.7-4.2 3.8 0 1.8 1.4 3 3 3"/><path d="M24 28.5V37M24 33c-2.5-1-4.5-.5-6 1M24 31c2.5-1 4.5-.5 6 1"/></svg>`;

function renderLogin() {
  $('#app').classList.add('hide'); $('#login').classList.remove('hide');
  $('#login').innerHTML = `
  <section class="login-art">
    ${roseSvg(520, '#fff').replace('<svg', '<svg class="bgrose"')}
    <div><div class="row">${roseSvg(34)}<b style="font-size:17px">WhiteRose</b><span class="mut" style="color:#8fb4bf">Cybersecurity and Software Development</span></div>
    <h1>Run the whole hospital from one screen.</h1>
    <p>Registration, OPD, wards and beds, laboratory, pharmacy, stores and billing. Every module is connected, so one patient ID follows the patient everywhere.</p>
    <ul><li>Unique patient IDs with a QR card</li><li>Eight roles, each with its own view</li><li>Bed allocation that prevents double booking</li><li>Itemised invoices with partial payments</li></ul></div>
    <div class="sm" style="color:#8fb4bf">WhiteRose Demo Multispeciality Hospital is fictional. Every record in this demo is made up.</div>
  </section>
  <section class="login-form">
    <div><span class="demo-chip">DEMO ENVIRONMENT</span></div>
    <div><h1>Sign in to HospitalOS</h1><p class="mut" style="margin:6px 0 0">Use a demo account below. Click any role to fill the form.</p></div>
    <form id="lf" onsubmit="A.login();return false" class="grid" style="gap:12px">
      ${field('Username', '<input name="user" autocomplete="username" required>')}
      ${field('Password', '<input name="pass" type="password" autocomplete="current-password" required>')}
      <div id="lerr" class="note warn hide"></div>
      <button class="btn p" style="justify-content:center;padding:10px">Sign in</button>
    </form>
    <div><div class="sm mut" style="margin-bottom:8px">Demo accounts (development only)</div>
    <div class="rolegrid">${DEMO_USERS.map(u => `<button class="rolebtn" onclick="A.fillLogin('${u.user}')"><b>${esc(ROLES[u.role].label)}</b><span>${esc(u.user)} / ${esc(u.pass)}</span></button>`).join('')}</div></div>
  </section>`;
}
def('fillLogin', u => { const d = DEMO_USERS.find(x => x.user === u); const f = $('#lf'); f.querySelector('[name=user]').value = d.user; const pw = f.querySelector('[name=pass]'); pw.value = d.pass; pw.focus(); });
def('login', () => {
  const f = fv('lf'); const u = DEMO_USERS.find(x => x.user === f.user.toLowerCase() && x.pass === f.pass);
  if (!u) { const e = $('#lerr'); e.textContent = 'Username or password is not correct. Pick a demo account below to fill it in.'; e.classList.remove('hide'); return; }
  startSession(u); 
});
function startSession(u) {
  session = { user:u.user, role:u.role, name:u.name, doctorId:u.doctorId || null };
  try { sessionStorage.setItem('wr_sess', u.user); } catch (e) {}
  audit('Signed in', ROLES[u.role].label); save();
  route = { m:'dashboard', p:{} }; renderShell();
}
def('logout', () => { audit('Signed out'); save(); session = null; try { sessionStorage.removeItem('wr_sess'); } catch (e) {} renderLogin(); });
def('switchUser', u => { const d = DEMO_USERS.find(x => x.user === u); if (d) { audit('Switched demo user', d.role); startSession(d); toast('Now signed in as ' + ROLES[d.role].label, 'ok'); } });

function renderShell() {
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  const nav = MODS.filter(m => canMod(m.id)).map(m => `<button data-m="${m.id}" onclick="A.go('${m.id}')">${icon(m.icon)}<span>${esc(m.label)}</span></button>`).join('');
  $('#app').innerHTML = `
  <aside id="side"><div class="brand">${roseSvg(32)}<div><b>WhiteRose HospitalOS</b><span>Cybersecurity and Software</span></div></div>
    <nav id="nav" aria-label="Main">${nav}</nav>
    <div class="side-foot"><button class="btn s" style="width:100%;justify-content:center" onclick="A.script()">Demo walkthrough</button><div style="margin-top:8px">${esc(db.hospital.id)}<br>Demo data resets on request</div></div></aside>
  <div id="main"><div class="demo-bar">DEMO ENVIRONMENT - fictional data, simulated payments</div>
    <header id="top"><button id="menu" onclick="$('#side').classList.toggle('open')" aria-label="Menu">Menu</button>
      <form class="search" onsubmit="A.search();return false"><input id="gs" placeholder="Search patient by name, ID, phone or scanned QR" aria-label="Search patients"><button class="btn">Find</button></form>
      <div class="grow"></div>
      <button class="btn" onclick="A.bell()" aria-label="Alerts">Alerts <span class="badge ${alerts().length ? 'warn' : ''}">${alerts().length}</span></button>
      <label style="width:170px"><select aria-label="Switch demo user" onchange="A.switchUser(this.value)">${DEMO_USERS.map(u => `<option value="${u.user}" ${u.user === session.user ? 'selected' : ''}>View as: ${esc(ROLES[u.role].short)}</option>`).join('')}</select></label>
      <div class="user"><div class="avatar">${esc(session.name.replace(/^(Dr\.|Sister|Brother)\s+/, '').split(' ').map(x => x[0]).slice(0, 2).join(''))}</div><div class="who"><div class="b">${esc(session.name)}</div><div class="sm mut">${esc(ROLES[session.role].label)}</div></div><button class="btn s" onclick="A.logout()">Sign out</button></div>
    </header><main id="view" tabindex="-1"></main></div>`;
  render();
}
def('go', (m, p) => { needMod(m); route = { m, p:p || {} }; $('#side') && $('#side').classList.remove('open'); render(); window.scrollTo(0, 0); });
const VIEWS = {};
function render() {
  if (!session) return;
  const cur = route.m === 'patient' ? 'patients' : route.m === 'consult' ? 'opd' : route.m;
  if (!canMod(cur) && route.m !== 'patient' && route.m !== 'consult') route = { m:'dashboard', p:{} };
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.m === (route.m === 'patient' ? 'patients' : route.m === 'consult' ? 'opd' : route.m)));
  const v = $('#view'); if (!v) return;
  try { v.innerHTML = VIEWS[route.m](route.p); } catch (e) { console.error(e); v.innerHTML = empty('This screen could not be shown', e.message); }
  const b = $('#top .btn .badge'); if (b) { const n = alerts().length; b.textContent = n; b.className = 'badge ' + (n ? 'warn' : ''); }
}
function commit(msg, kind) { save(); render(); if (msg) toast(msg, kind || 'ok'); }

/* ---- global search, alerts, walkthrough, reset ---- */
def('search', () => {
  needMod('patients'); let q = $('#gs').value.trim(); if (!q) return;
  const m = q.match(/WR:\/\/patient\/(WR-PAT-\d+)/i); if (m) q = m[1];
  const ql = q.toLowerCase(); const hits = db.patients.filter(p => p.id.toLowerCase() === ql || p.name.toLowerCase().includes(ql) || p.phone.includes(q) || p.id.toLowerCase().includes(ql));
  if (!hits.length) return toast('No patient matches "' + q + '". Check the spelling or register a new patient.', 'err');
  if (hits.length === 1) { audit('Opened patient via search', hits[0].id); return A.openPatient(hits[0].id); }
  openModal({ title:hits.length + ' patients found', noFocus:true, body:table(['Patient', 'Age / sex', 'Phone'], hits.slice(0, 30).map(p => [pLink(p.id).replace('onclick="', 'onclick="closeModal();'), age(p.dob) + ' / ' + p.gender, esc(p.phone)])) });
});
def('bell', () => { const a = alerts(); openModal({ title:'Alerts', noFocus:true, body: a.length ? a.map(x => `<div class="note ${x.k === 'bad' ? 'warn' : ''}" style="margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${esc(x.t)}</span>${canMod(x.go) ? `<button class="btn s" onclick="closeModal();A.go('${x.go}')">Open</button>` : ''}</div>`).join('') : empty('No alerts', 'Stock, expiry and lab queues are all in order.') }); });
def('resetDemo', () => {
  need('demo.reset');
  openModal({ title:'Reset demo data', body:'<p>This deletes everything you entered in this browser and loads the original fictional data again.</p>', footer:`<button class="btn" onclick="closeModal()">Keep my data</button><button class="btn d" onclick="A.doReset()">Reset demo</button>` });
});
def('doReset', () => { need('demo.reset'); db = buildSeed(); save(); closeModal(); route = { m:'dashboard', p:{} }; renderShell(); toast('Demo data has been reset.', 'ok'); });
def('script', () => {
  const steps = [['Sign in as administrator', 'dashboard', 'admin'], ['Register a patient and get the QR card', 'patients', 'admin'], ['Book an appointment', 'appointments', 'admin'], ['Check the patient in to OPD', 'appointments', 'reception'], ['Doctor records the consultation, prescription and lab order', 'opd', 'doctor'], ['Lab enters and verifies the result', 'lab', 'lab'], ['Pharmacist dispenses medicine (stock goes down)', 'pharmacy', 'pharmacist'], ['Accountant generates the invoice', 'billing', 'accountant'], ['Record a simulated payment', 'billing', 'accountant'], ['Admit another patient to a bed', 'ipd', 'admin'], ['Transfer the patient to another bed', 'ipd', 'nurse'], ['Discharge and print the summary', 'ipd', 'doctor'], ['Check dashboard and reports', 'reports', 'admin']];
  openModal({ title:'Live demo walkthrough', noFocus:true, wide:true, body:`<p class="mut" style="margin-top:0">Follow these steps to show the full patient journey. Each button switches to the right role and opens the right screen.</p>${table(['Step', 'What to show', 'Role', ''], steps.map((s, i) => [i + 1, esc(s[0]), esc(ROLES[s[2]].short), `<button class="btn s" onclick="closeModal();A.switchUser('${s[2]}');A.go('${s[1]}')">Go</button>`]))}`, footer: can('demo.reset') ? `<button class="btn d" onclick="closeModal();A.resetDemo()">Reset demo data</button>` : '' });
});

/* ---- boot ---- */
window.addEventListener('DOMContentLoaded', () => {
  db = load();
  let u = null; try { const s = sessionStorage.getItem('wr_sess'); if (s) u = DEMO_USERS.find(x => x.user === s); } catch (e) {}
  if (u) startSession(u); else renderLogin();
});
