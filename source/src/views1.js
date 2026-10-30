/* ===== views 1: dashboard, patients, appointments, OPD/EMR, staff ===== */
const ST = {};  /* small per-screen UI state (tabs, filters) */

VIEWS.dashboard = () => {
  const t = todayStr(); const r = session.role;
  const bedsOcc = db.beds.filter(b => b.status === 'occupied').length, bedsFree = db.beds.filter(b => b.status === 'free').length;
  const todayAp = db.appointments.filter(a => a.date === t && a.status !== 'Cancelled');
  const outstanding = sum(db.invoices, balance);
  const pendLab = db.labOrders.filter(l => l.status !== 'Verified').length;
  const W = {
    patients:{ l:'Registered patients', n:db.patients.length, go:'patients', roles:['admin', 'reception', 'doctor', 'nurse'] },
    appts:{ l:"Today's appointments", n:todayAp.length, go:'appointments', roles:['admin', 'reception', 'doctor', 'nurse'] },
    queue:{ l:'Waiting in OPD queue', n:todayAp.filter(a => a.status === 'Checked-in').length, go:'opd', roles:['admin', 'doctor', 'nurse', 'reception'], c:'w' },
    adm:{ l:'Current admissions', n:activeAdm().length, go:'ipd', roles:['admin', 'doctor', 'nurse', 'reception'] },
    beds:{ l:'Beds available / occupied', n:bedsFree + ' / ' + bedsOcc, go:'ipd', roles:['admin', 'nurse', 'reception', 'doctor'], c:'n2' },
    coll:{ l:"Today's collections", n:money(collectionsOn(t)), go:'billing', roles:['admin', 'accountant', 'reception'] },
    out:{ l:'Outstanding bills', n:money(outstanding), go:'billing', roles:['admin', 'accountant'], c:'d' },
    lab:{ l:'Pending lab reports', n:pendLab, go:'lab', roles:['admin', 'lab', 'doctor'], c:'w' },
    col:{ l:'Samples to collect', n:db.labOrders.filter(l => l.status === 'Ordered').length, go:'lab', roles:['lab'], c:'w' },
    ver:{ l:'Results awaiting verification', n:db.labOrders.filter(l => l.status === 'Resulted').length, go:'lab', roles:['lab'], c:'d' },
    rx:{ l:'Prescriptions to dispense', n:db.prescriptions.filter(x => x.status === 'Pending').length, go:'pharmacy', roles:['pharmacist'], c:'w' },
    low:{ l:'Low-stock medicines', n:lowMeds().length, go:'pharmacy', roles:['admin', 'pharmacist'], c:'d' },
    exp:{ l:'Batches expiring in 60 days', n:expiring(60).length, go:'pharmacy', roles:['admin', 'pharmacist'], c:'w' },
    sup:{ l:'Supplies below minimum', n:db.items.filter(i => i.qty <= i.min).length, go:'inventory', roles:['admin', 'inventory'], c:'d' },
    po:{ l:'Open purchase orders', n:db.pos.filter(p => p.status === 'Ordered').length, go:'inventory', roles:['inventory'], c:'n2' },
    mine:{ l:'My consultations today', n:todayAp.filter(a => a.doctor === session.doctorId).length, go:'opd', roles:['doctor'], c:'n2' },
  };
  const kp = Object.values(W).filter(w => w.roles.includes(r));
  const days = [...Array(7)].map((_, i) => addDays(i - 6));
  const rev = days.map(d => collectionsOn(d));
  const dept = db.departments.map(d => ({ l:d.name.split(' ')[0].slice(0, 6), v:db.appointments.filter(a => db.doctors.find(x => x.id === a.doctor).dept === d.id).length }));
  const showCharts = ['admin', 'accountant'].includes(r);
  const al = alerts().slice(0, 6);
  const hi = new Date().getHours(); const greet = hi < 12 ? 'Good morning' : hi < 17 ? 'Good afternoon' : 'Good evening';
  const myQ = todayAp.filter(a => ['Checked-in', 'In consultation'].includes(a.status) && (r !== 'doctor' || a.doctor === session.doctorId));
  return `
  <div class="head"><div><h1>${greet}, ${esc(session.name.split(' ').slice(0, 2).join(' '))}</h1><p>${esc(db.hospital.name)} - ${esc(ROLES[r].label)} dashboard</p></div>
    <div class="row">${can('patient.create') ? `<button class="btn p" onclick="A.newPatient()">Register patient</button>` : ''}<button class="btn" onclick="A.script()">Demo walkthrough</button></div></div>
  <div class="grid g4" style="margin-bottom:16px">${kp.map(k => `<div class="card kpi ${k.c || ''}" onclick="A.go('${k.go}')" role="link" tabindex="0"><span class="n mono">${k.n}</span><span class="l">${k.l}</span></div>`).join('')}</div>
  ${showCharts ? `<div class="grid g2" style="margin-bottom:16px">
    <div class="card"><div class="ch"><h3>Collections, last 7 days</h3><span class="sm mut">Net of refunds</span></div><div class="cb">${lineChart([{ v:rev, c:'#0f9b8e' }], days.map(d => d.slice(8)), { fmt:v => money(v), label:'Collections last 7 days' })}</div></div>
    <div class="card"><div class="ch"><h3>Appointments by department</h3><span class="sm mut">All time in demo</span></div><div class="cb">${barChart(dept, { color:'#12384f', label:'Appointments by department' })}</div></div></div>` : ''}
  <div class="grid g21">
    <div class="card"><div class="ch"><h3>${r === 'doctor' ? 'My queue' : "Today's OPD queue"}</h3>${canMod('opd') ? `<button class="btn s" onclick="A.go('opd')">Open OPD</button>` : ''}</div>
      ${table(['Token', 'Patient', 'Doctor', 'Status'], myQ.slice(0, 8).map(a => [`<span class="token">${a.token || '-'}</span>`, pLink(a.patient), esc(DOC(a.doctor).name), badge(a.status)]), 'No patients waiting', 'Check in a patient from Appointments and they appear here.')}</div>
    <div class="card"><div class="ch"><h3>Alerts</h3></div><div class="cb" style="display:grid;gap:8px">${al.length ? al.map(x => `<div class="note ${x.k === 'bad' ? 'warn' : ''}">${esc(x.t)}</div>`).join('') : '<span class="mut">Nothing needs attention.</span>'}</div></div>
  </div>`;
};

/* ---------------- patients ---------------- */
VIEWS.patients = () => {
  const q = (ST.pq || '').toLowerCase();
  const list = db.patients.filter(p => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.phone.includes(q)).sort((a, b) => b.id.localeCompare(a.id));
  return `<div class="head"><div><h1>Patients</h1><p>${db.patients.length} registered. Every patient has one permanent ID.</p></div>
    ${can('patient.create') ? `<button class="btn p" onclick="A.newPatient()">Register patient</button>` : ''}</div>
  <div class="card"><div class="ch"><input style="max-width:340px" placeholder="Filter by name, ID or phone" value="${esc(ST.pq || '')}" oninput="ST.pq=this.value;A.refreshList()" aria-label="Filter patients"><span class="sm mut">${list.length} shown</span></div>
  <div id="plist">${patientTable(list)}</div></div>`;
};
const patientTable = list => table(['Patient ID', 'Name', 'Age / sex', 'Phone', 'Blood group', 'Registered', ''], list.slice(0, 60).map(p => [`<span class="mono b">${p.id}</span>`, `<a href="#" onclick="A.openPatient('${p.id}');return false">${esc(p.name)}</a>`, age(p.dob) + ' / ' + p.gender[0], esc(p.phone), esc(p.bloodGroup), fdate(p.createdAt), `<button class="btn s" onclick="A.showCard('${p.id}')">ID card</button>`]), 'No patient matches', 'Try a different name or ID, or register a new patient.');
def('refreshList', () => { const q = (ST.pq || '').toLowerCase(); const l = db.patients.filter(p => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.phone.includes(q)).sort((a, b) => b.id.localeCompare(a.id)); $('#plist').innerHTML = patientTable(l); });

def('newPatient', () => {
  need('patient.create');
  openModal({ title:'Register new patient', wide:true, body:`<div id="pf" class="form">
    ${field('Full name *', '<input name="name" required>')}${field('Gender *', '<select name="gender"><option>Female</option><option>Male</option><option>Other</option></select>')}
    ${field('Date of birth *', `<input name="dob" type="date" max="${todayStr()}">`)}${field('Phone (10 digits) *', '<input name="phone" inputmode="numeric" maxlength="10">')}
    ${field('Email', '<input name="email" type="email">')}${field('Blood group', '<select name="bloodGroup"><option>Unknown</option>' + ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(x => `<option>${x}</option>`).join('') + '</select>')}
    ${field('Address', '<input name="address">', 'full')}
    ${field('Emergency contact name *', '<input name="emergencyName">')}${field('Emergency contact phone *', '<input name="emergencyPhone" inputmode="numeric" maxlength="10">')}
    ${field('Allergies', '<input name="allergies" placeholder="e.g. Penicillin, or None known">')}${field('Medical history', '<input name="history" placeholder="e.g. Hypertension, Type 2 diabetes">')}
  </div>`, footer:`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn p" onclick="A.savePatient()">Register and generate ID</button>` });
});
def('savePatient', () => {
  need('patient.create'); const f = fv('pf');
  if (f.name.length < 3) throw new VErr('Enter the patient\'s full name.');
  if (!f.dob) throw new VErr('Enter the date of birth.');
  if (!/^[6-9]\d{9}$/.test(f.phone)) throw new VErr('Enter a valid 10-digit mobile number.');
  if (!f.emergencyName || !/^\d{10}$/.test(f.emergencyPhone)) throw new VErr('Add an emergency contact name and a 10-digit number.');
  const dup = db.patients.find(p => p.phone === f.phone && p.name.toLowerCase() === f.name.toLowerCase());
  if (dup) throw new VErr('This patient may already exist as ' + dup.id + '. Open the existing record instead.');
  const p = { id:nextId(db, 'patient'), name:f.name, gender:f.gender, dob:f.dob, phone:f.phone, email:f.email, bloodGroup:f.bloodGroup, address:f.address, emergencyName:f.emergencyName, emergencyPhone:f.emergencyPhone, allergies:f.allergies || 'None known', history:f.history || 'None', createdAt:todayStr(), token:Math.random().toString(36).slice(2, 10) };
  db.patients.push(p); audit('Registered patient', p.id); save(); render(); closeModal(); toast('Patient registered with ID ' + p.id, 'ok'); A.showCard(p.id, true);
});
def('showCard', (id, justNew) => {
  const p = P(id);
  openModal({ title:'Patient ID card', noFocus:true, body:`${justNew ? `<div class="note" style="margin-bottom:14px">Registration complete. The permanent patient ID is <b>${p.id}</b>.</div>` : ''}
    <div class="row" style="align-items:flex-start;gap:24px">${cardHtml(p)}<div style="flex:1;min-width:220px" class="grid">
      <div class="note">The QR code holds only the patient ID and a lookup key. No diagnosis, allergy or contact detail is inside it. Staff must sign in and have access to open the record.</div>
      <button class="btn p" onclick="A.slip('${p.id}')">Registration slip</button>
      ${can('appt.book') ? `<button class="btn" onclick="closeModal();A.bookAppt('${p.id}')">Book appointment</button>` : ''}
      <button class="btn" onclick="closeModal();A.openPatient('${p.id}')">Open patient profile</button></div></div>`, footer:`<button class="btn n" onclick="window.print()">Print card</button>` });
});
const cardHtml = p => `<div class="idcard"><div class="top">${roseSvg(30)}<div><b>${esc(db.hospital.name)}</b><span>Patient identity card (demo)</span></div></div>
  <div class="mid"><div class="qr">${qrSvg(patientQR(p))}</div><div><div class="sm mut">Patient ID</div><div class="pid mono">${p.id}</div><div class="b" style="margin-top:6px">${esc(p.name)}</div><div class="sm mut">${age(p.dob)} yrs, ${esc(p.gender)} | ${esc(p.bloodGroup)}</div></div></div>
  <div class="foot">Scan with an authorised hospital account. Emergency: ${esc(db.hospital.phone)}</div></div>`;
def('slip', id => { const p = P(id); showDoc('Registration slip', `${docHead('Registration slip')}<table><tr><td>Patient ID</td><td><b>${p.id}</b></td><td>Registered on</td><td>${fdate(p.createdAt)}</td></tr><tr><td>Name</td><td>${esc(p.name)}</td><td>Age / sex</td><td>${age(p.dob)} / ${esc(p.gender)}</td></tr><tr><td>Phone</td><td>${esc(p.phone)}</td><td>Blood group</td><td>${esc(p.bloodGroup)}</td></tr><tr><td>Address</td><td colspan="3">${esc(p.address || '-')}</td></tr><tr><td>Emergency contact</td><td colspan="3">${esc(p.emergencyName)} (${esc(p.emergencyPhone)})</td></tr><tr><td>Allergies</td><td colspan="3">${esc(p.allergies)}</td></tr></table><div style="display:flex;gap:18px;align-items:center"><div style="width:110px">${qrSvg(patientQR(p))}</div><div class="sm">Please keep this slip and carry your patient ID card on every visit. Quote ${p.id} at every counter.</div></div>`, false); });

def('openPatient', id => { needMod('patients'); route = { m:'patient', p:{ id } }; ST.ptab = 'overview'; audit('Viewed patient record', id); render(); window.scrollTo(0, 0); });
def('ptab', t => { ST.ptab = t; render(); });
VIEWS.patient = ({ id }) => {
  const p = P(id); const tab = ST.ptab || 'overview';
  const visits = db.visits.filter(v => v.patient === id).sort((a, b) => b.date.localeCompare(a.date));
  const rxs = db.prescriptions.filter(x => x.patient === id); const labs = db.labOrders.filter(l => l.patient === id); const invs = db.invoices.filter(i => i.patient === id); const adms = db.admissions.filter(a => a.patient === id);
  let body = '';
  if (tab === 'overview') body = `<div class="grid g2"><div class="card"><div class="ch"><h3>Details</h3></div><div class="cb"><dl class="kv"><dt>Patient ID</dt><dd class="b mono">${p.id}</dd><dt>Age / sex</dt><dd>${age(p.dob)} years, ${esc(p.gender)}</dd><dt>Date of birth</dt><dd>${fdate(p.dob)}</dd><dt>Phone</dt><dd>${esc(p.phone)}</dd><dt>Address</dt><dd>${esc(p.address || '-')}</dd><dt>Blood group</dt><dd>${esc(p.bloodGroup)}</dd><dt>Emergency</dt><dd>${esc(p.emergencyName)} (${esc(p.emergencyPhone)})</dd></dl></div></div>
    <div class="card"><div class="ch"><h3>Clinical summary</h3></div><div class="cb"><dl class="kv"><dt>Allergies</dt><dd>${/none/i.test(p.allergies) ? esc(p.allergies) : `<span class="badge bad">${esc(p.allergies)}</span>`}</dd><dt>Medical history</dt><dd>${esc(p.history)}</dd><dt>Visits</dt><dd>${visits.length}</dd><dt>Last visit</dt><dd>${visits[0] ? fdate(visits[0].date) : 'No visits yet'}</dd><dt>Admission</dt><dd>${adms.find(a => a.status === 'Admitted') ? badge('Admitted') + ' ' + esc(bedName(adms.find(a => a.status === 'Admitted').bed)) : 'Not admitted'}</dd><dt>Outstanding</dt><dd>${money(sum(invs, balance))}</dd></dl></div></div></div>`;
  if (tab === 'visits') body = `<div class="card">${table(['Date', 'Doctor', 'Diagnosis', 'Vitals', ''], visits.map(v => [fdate(v.date), esc(DOC(v.doctor).name), esc(v.diagnosis), `BP ${esc(v.vitals.bp)}, pulse ${v.vitals.pulse}, SpO2 ${v.vitals.spo2}%`, `<button class="btn s" onclick="A.visitSummary('${v.id}')">Visit summary</button>`]), 'No visits recorded', 'Visits appear here after a doctor completes a consultation.')}</div>`;
  if (tab === 'rx') body = `<div class="card">${table(['Prescription', 'Date', 'Doctor', 'Medicines', 'Status', ''], rxs.map(x => [`<span class="mono">${x.id}</span>`, fdate(x.date), esc(DOC(x.doctor).name), x.items.map(i => esc(byId(db.medicines, i.med).name)).join(', '), badge(x.status), `<button class="btn s" onclick="A.printRx('${x.id}')">Print</button>`]), 'No prescriptions yet')}</div>`;
  if (tab === 'lab') body = `<div class="card">${table(['Order', 'Date', 'Tests', 'Status', ''], labs.map(l => [`<span class="mono">${l.id}</span>`, fdate(l.date), esc(l.tests.map(t => t.name).join(', ')), badge(l.status), l.status === 'Verified' ? `<button class="btn s" onclick="A.printLab('${l.id}')">Report</button>` : '']), 'No lab orders yet')}</div>`;
  if (tab === 'bills') body = `<div class="card">${table(['Invoice', 'Date', 'Total', 'Balance', 'Status', ''], invs.map(i => [`<span class="mono">${i.id}</span>`, fdate(i.date), money(net(i)), money(balance(i)), badge(i.status), canMod('billing') ? `<button class="btn s" onclick="A.invoice('${i.id}')">Open</button>` : '']), 'No invoices yet')}</div>`;
  if (tab === 'adm') body = `<div class="card">${table(['Admission', 'Admitted', 'Bed', 'Diagnosis', 'Status'], adms.map(a => [`<span class="mono">${a.id}</span>`, fdate(a.admittedAt), esc(bedName(a.bed)), esc(a.diagnosis), badge(a.status)]), 'No admissions')}</div>`;
  return `<div class="head"><div><a href="#" onclick="A.go('patients');return false" class="sm">Back to patients</a><h1>${esc(p.name)} <span class="mono mut" style="font-size:15px;font-weight:500">${p.id}</span></h1><p>${age(p.dob)} years, ${esc(p.gender)} | ${esc(p.phone)}</p></div>
    <div class="row"><button class="btn" onclick="A.showCard('${p.id}')">ID card</button><button class="btn" onclick="A.slip('${p.id}')">Registration slip</button>${can('appt.book') ? `<button class="btn p" onclick="A.bookAppt('${p.id}')">Book appointment</button>` : ''}${can('ipd.admit') ? `<button class="btn" onclick="A.admit('${p.id}')">Admit</button>` : ''}</div></div>
  ${tabs([['overview', 'Overview'], ['visits', 'Visits (' + visits.length + ')'], ['rx', 'Prescriptions (' + rxs.length + ')'], ['lab', 'Lab (' + labs.length + ')'], ['bills', 'Billing (' + invs.length + ')'], ['adm', 'Admissions (' + adms.length + ')']], tab, 'A.ptab')}${body}`;
};

/* ---------------- appointments + queue ---------------- */
VIEWS.appointments = () => {
  const tab = ST.atab || 'today'; const t = todayStr();
  let list;
  if (tab === 'today') list = db.appointments.filter(a => a.date === t); else if (tab === 'upcoming') list = db.appointments.filter(a => a.date > t); else list = db.appointments.filter(a => a.date < t);
  list = list.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const rows = list.map(a => [a.token ? `<span class="token">${a.token}</span>` : '<span class="mut">-</span>', `${fdate(a.date)}<div class="sm mut">${a.time}</div>`, pLink(a.patient), `${esc(DOC(a.doctor).name)}<div class="sm mut">${esc(deptName(DOC(a.doctor).dept))}</div>`, `${esc(a.reason)}<div class="sm mut">${a.type}</div>`, badge(a.status),
    `<div class="row">${a.status === 'Booked' && can('appt.checkin') ? `<button class="btn s p" onclick="A.checkin('${a.id}')">Check in</button>` : ''}${['Booked', 'Checked-in'].includes(a.status) && can('appt.cancel') ? `<button class="btn s d" onclick="A.cancelAppt('${a.id}')">Cancel</button>` : ''}${a.visit ? `<button class="btn s" onclick="A.visitSummary('${a.visit}')">Summary</button>` : ''}</div>`]);
  const sched = db.doctors.map(d => [`<b>${esc(d.name)}</b><div class="sm mut">${esc(d.qual)}</div>`, esc(deptName(d.dept)), esc(d.days), esc(d.slots), esc(d.room), money(d.fee), db.appointments.filter(a => a.doctor === d.id && a.date === t && a.status !== 'Cancelled').length]);
  return `<div class="head"><div><h1>Appointments</h1><p>Book visits, register walk-ins and run the check-in queue.</p></div><div class="row">${can('appt.book') ? `<button class="btn" onclick="A.bookAppt('', true)">Walk-in</button><button class="btn p" onclick="A.bookAppt('')">Book appointment</button>` : ''}</div></div>
  ${tabs([['today', "Today"], ['upcoming', 'Upcoming'], ['past', 'Past'], ['doctors', 'Doctor schedules']], tab, 'A.atab')}
  <div class="card">${tab === 'doctors' ? table(['Doctor', 'Department', 'Days', 'Hours', 'Room', 'Fee', 'Today'], sched) : table(['Token', 'When', 'Patient', 'Doctor', 'Reason', 'Status', ''], rows, 'No appointments here', tab === 'today' ? 'Book an appointment or register a walk-in.' : '')}</div>`;
};
def('atab', t => { ST.atab = t; render(); });
def('bookAppt', (pid, walkin) => {
  need('appt.book');
  openModal({ title: walkin ? 'Walk-in registration' : 'Book appointment', body:`<div id="af" class="form">
    ${field('Patient *', `<select name="patient">${patientOptions(pid)}</select>`, 'full')}
    ${field('Doctor *', `<select name="doctor">${opt(db.doctors, d => d.id, d => d.name + ' - ' + deptName(d.dept) + ' (' + money(d.fee) + ')')}</select>`, 'full')}
    ${walkin ? '' : field('Date *', `<input type="date" name="date" min="${todayStr()}" value="${addDays(1)}">`) + field('Time *', `<select name="time">${['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30'].map(x => `<option>${x}</option>`).join('')}</select>`)}
    ${field('Reason for visit *', '<input name="reason" placeholder="e.g. Fever for 2 days">', 'full')}</div>
    ${walkin ? '<div class="note" style="margin-top:12px">Walk-ins are booked for now and checked in straight away. A token number is issued.</div>' : ''}
    ${!pid && walkin ? `<p class="sm mut">New patient? <a href="#" onclick="closeModal();A.newPatient();return false">Register them first</a>.</p>` : ''}`,
    footer:`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn p" onclick="A.saveAppt(${walkin ? 'true' : 'false'})">${walkin ? 'Register walk-in' : 'Book appointment'}</button>` });
});
function issueToken(docId, date) { const k = docId + date; db.tokens[k] = (db.tokens[k] || 0) + 1; return db.tokens[k]; }
def('saveAppt', walkin => {
  need('appt.book'); const f = fv('af');
  if (!f.patient) throw new VErr('Select a patient.'); if (!f.reason) throw new VErr('Enter the reason for the visit.');
  const date = walkin ? todayStr() : f.date; const time = walkin ? new Date().toTimeString().slice(0, 5) : f.time;
  if (!date || date < todayStr()) throw new VErr('Choose today or a future date.');
  if (!walkin && db.appointments.some(a => a.doctor === f.doctor && a.date === date && a.time === time && a.status !== 'Cancelled')) throw new VErr('That slot is already booked for this doctor. Pick another time.');
  if (db.appointments.some(a => a.patient === f.patient && a.date === date && ['Booked', 'Checked-in', 'In consultation'].includes(a.status) && a.doctor === f.doctor)) throw new VErr('This patient already has an appointment with this doctor on that day.');
  const a = { id:nextId(db, 'appointment'), patient:f.patient, doctor:f.doctor, date, time, type: walkin ? 'Walk-in' : 'Scheduled', reason:f.reason, status: walkin ? 'Checked-in' : 'Booked', token: walkin ? issueToken(f.doctor, date) : null, visit:null, createdAt:todayStr() };
  db.appointments.push(a); audit(walkin ? 'Walk-in registered' : 'Appointment booked', a.id); save(); closeModal(); route = { m:'appointments', p:{} }; ST.atab = date === todayStr() ? 'today' : 'upcoming'; render();
  toast(walkin ? 'Walk-in checked in. Token ' + a.token : 'Appointment ' + a.id + ' booked for ' + fdate(date) + ' at ' + time, 'ok');
});
def('checkin', id => { need('appt.checkin'); const a = byId(db.appointments, id); if (a.date !== todayStr()) throw new VErr('Check-in is only possible on the day of the appointment (' + fdate(a.date) + ').'); a.status = 'Checked-in'; a.token = a.token || issueToken(a.doctor, a.date); audit('Patient checked in', a.id); commit('Checked in. Token ' + a.token + ' for ' + DOC(a.doctor).name); });
def('cancelAppt', id => { need('appt.cancel'); const a = byId(db.appointments, id); a.status = 'Cancelled'; audit('Appointment cancelled', id); commit('Appointment cancelled', 'ok'); });

/* ---------------- OPD + consultation (EMR) ---------------- */
VIEWS.opd = () => {
  const t = todayStr(); const mine = session.role === 'doctor' ? session.doctorId : (ST.opdDoc || '');
  let q = db.appointments.filter(a => a.date === t && ['Checked-in', 'In consultation'].includes(a.status) && (!mine || a.doctor === mine)).sort((a, b) => (a.token || 0) - (b.token || 0));
  const done = db.appointments.filter(a => a.date === t && a.status === 'Completed' && (!mine || a.doctor === mine));
  return `<div class="head"><div><h1>OPD and consultations</h1><p>${session.role === 'doctor' ? esc(DOC(session.doctorId).name) + ' - your queue for today' : 'Patients waiting today'}</p></div>
    ${session.role !== 'doctor' ? `<label style="width:260px">Doctor<select onchange="ST.opdDoc=this.value;render()"><option value="">All doctors</option>${opt(db.doctors, d => d.id, d => d.name, mine)}</select></label>` : ''}</div>
  <div class="card" style="margin-bottom:16px"><div class="ch"><h3>Waiting (${q.length})</h3></div>${table(['Token', 'Patient', 'Doctor', 'Reason', 'Status', ''], q.map(a => [`<span class="token">${a.token}</span>`, pLink(a.patient), esc(DOC(a.doctor).name), esc(a.reason), badge(a.status),
      `<div class="row">${can('vitals') ? `<button class="btn s" onclick="A.vitals('${a.id}')">Vitals</button>` : ''}${can('consult') ? `<button class="btn s p" onclick="A.startConsult('${a.id}')">${a.status === 'In consultation' ? 'Continue' : 'Start consultation'}</button>` : ''}</div>`]), 'Nobody is waiting', 'Patients appear here after check-in at reception.')}</div>
  <div class="card"><div class="ch"><h3>Seen today (${done.length})</h3></div>${table(['Patient', 'Doctor', 'Diagnosis', ''], done.map(a => { const v = byId(db.visits, a.visit) || {}; return [pLink(a.patient), esc(DOC(a.doctor).name), esc(v.diagnosis || '-'), a.visit ? `<button class="btn s" onclick="A.visitSummary('${a.visit}')">Visit summary</button>` : '']; }), 'No consultations completed yet')}</div>`;
};
def('vitals', id => {
  need('vitals'); const a = byId(db.appointments, id); const v = a.vitals || {};
  openModal({ title:'Record vital signs - ' + P(a.patient).name, body:`<div id="vf" class="form">${field('Blood pressure', `<input name="bp" placeholder="120/80" value="${esc(v.bp || '')}">`)}${field('Pulse (per min)', `<input name="pulse" type="number" value="${esc(v.pulse || '')}">`)}${field('Temperature (F)', `<input name="temp" type="number" step="0.1" value="${esc(v.temp || '')}">`)}${field('SpO2 (%)', `<input name="spo2" type="number" value="${esc(v.spo2 || '')}">`)}${field('Weight (kg)', `<input name="weight" type="number" value="${esc(v.weight || '')}">`)}</div>`, footer:`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn p" onclick="A.saveVitals('${id}')">Save vitals</button>` });
});
def('saveVitals', id => { need('vitals'); const f = fv('vf'); if (!/^\d{2,3}\/\d{2,3}$/.test(f.bp)) throw new VErr('Enter blood pressure like 120/80.'); const a = byId(db.appointments, id); a.vitals = { bp:f.bp, pulse:+f.pulse || 0, temp:+f.temp || 0, spo2:+f.spo2 || 0, weight:+f.weight || 0 }; audit('Vitals recorded', id); closeModal(); commit('Vitals saved'); });
def('startConsult', id => { need('consult'); const a = byId(db.appointments, id); if (session.role === 'doctor' && a.doctor !== session.doctorId) throw new VErr('This patient is booked with ' + DOC(a.doctor).name + '.'); a.status = 'In consultation'; save(); route = { m:'consult', p:{ id } }; ST.rxRows = 1; render(); window.scrollTo(0, 0); });
VIEWS.consult = ({ id }) => {
  const a = byId(db.appointments, id); const p = P(a.patient); const v = a.vitals || {}; const old = db.visits.filter(x => x.patient === p.id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 3);
  const rows = ST.rxRows || 1;
  return `<div class="head"><div><a href="#" onclick="A.go('opd');return false" class="sm">Back to queue</a><h1>Consultation: ${esc(p.name)}</h1><p><span class="mono">${p.id}</span> | ${age(p.dob)} yrs, ${esc(p.gender)} | token ${a.token} | ${esc(DOC(a.doctor).name)}</p></div></div>
  <div class="grid g21"><div class="grid" id="cf">
    <div class="card"><div class="ch"><h3>Vital signs</h3></div><div class="cb form">${field('Blood pressure', `<input name="bp" value="${esc(v.bp || '')}" placeholder="120/80">`)}${field('Pulse', `<input name="pulse" type="number" value="${esc(v.pulse || '')}">`)}${field('Temp (F)', `<input name="temp" type="number" step="0.1" value="${esc(v.temp || '')}">`)}${field('SpO2 %', `<input name="spo2" type="number" value="${esc(v.spo2 || '')}">`)}${field('Weight kg', `<input name="weight" type="number" value="${esc(v.weight || '')}">`)}</div></div>
    <div class="card"><div class="ch"><h3>Clinical notes</h3></div><div class="cb form">${field('Symptoms *', `<textarea name="symptoms">${esc(a.reason)}</textarea>`, 'full')}${field('Examination notes', '<textarea name="notes"></textarea>', 'full')}${field('Diagnosis *', '<input name="diagnosis" placeholder="e.g. Viral fever">')}${field('Treatment plan *', '<input name="plan" placeholder="e.g. Rest, fluids, medicines as prescribed">')}</div></div>
    <div class="card"><div class="ch"><h3>Prescription</h3><button class="btn s" onclick="ST.rxRows=Math.min(6,(ST.rxRows||1)+1);A.keepForm()">Add medicine</button></div><div class="cb" style="display:grid;gap:10px">
      ${[...Array(rows)].map((_, i) => `<div class="form" style="grid-template-columns:2fr 1fr 1.2fr .7fr .7fr">${field('Medicine', `<select name="med${i}"><option value="">None</option>${opt(db.medicines, m => m.id, m => m.name)}</select>`)}${field('Dose', `<input name="dose${i}" value="1 tablet">`)}${field('Frequency', `<select name="freq${i}"><option>Once daily</option><option selected>Twice daily</option><option>Three times daily</option><option>At night</option><option>As needed</option></select>`)}${field('Days', `<input name="days${i}" type="number" min="1" value="5">`)}${field('Qty', `<input name="qty${i}" type="number" min="1" value="10">`)}</div>`).join('')}
      <div class="sm mut">Allergy on file: <b>${esc(p.allergies)}</b></div></div></div>
    <div class="card"><div class="ch"><h3>Lab tests and follow-up</h3></div><div class="cb"><div class="pills" style="margin-bottom:12px">${db.labTests.map(t => `<label style="display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 12px;color:var(--ink);font-weight:500"><input type="checkbox" name="labs" value="${t.code}" style="width:auto"> ${esc(t.name)} (${money(t.price)})</label>`).join('')}</div>
      <div class="form">${field('Follow-up date', `<input type="date" name="followup" min="${addDays(1)}">`)}</div></div></div>
    <div class="row"><button class="btn p" onclick="A.finishConsult('${id}')">Complete consultation</button><button class="btn" onclick="A.go('opd')">Save later</button></div>
  </div>
  <div class="grid" style="align-content:start"><div class="card"><div class="ch"><h3>Patient background</h3></div><div class="cb"><dl class="kv"><dt>Allergies</dt><dd>${esc(p.allergies)}</dd><dt>History</dt><dd>${esc(p.history)}</dd><dt>Blood group</dt><dd>${esc(p.bloodGroup)}</dd></dl></div></div>
    <div class="card"><div class="ch"><h3>Previous visits</h3></div>${old.length ? old.map(o => `<div class="cb" style="border-bottom:1px solid var(--line)"><b>${esc(o.diagnosis)}</b><div class="sm mut">${fdate(o.date)} - ${esc(DOC(o.doctor).name)}</div></div>`).join('') : empty('First visit', 'No earlier visits on record.')}</div></div></div>`;
};
def('keepForm', () => { const f = fv('cf'); render(); Object.entries(f).forEach(([k, v]) => { const el = document.querySelector('#cf [name="' + k + '"]'); if (el && el.type !== 'checkbox') el.value = v; else if (el && Array.isArray(v)) { document.querySelectorAll('#cf [name="labs"]').forEach(c => c.checked = v.includes(c.value)); } }); });
def('finishConsult', id => {
  need('consult'); const f = fv('cf'); const a = byId(db.appointments, id);
  if (!f.symptoms) throw new VErr('Enter the symptoms.'); if (!f.diagnosis) throw new VErr('Enter a diagnosis.'); if (!f.plan) throw new VErr('Enter a treatment plan.');
  if (!/^\d{2,3}\/\d{2,3}$/.test(f.bp)) throw new VErr('Enter blood pressure like 120/80 (nurse or doctor can record it).');
  const items = []; for (let i = 0; i < 6; i++) { if (f['med' + i]) { const q = +f['qty' + i], d = +f['days' + i]; if (!(q > 0) || !(d > 0)) throw new VErr('Enter quantity and days for each medicine.'); items.push({ med:f['med' + i], dose:f['dose' + i], freq:f['freq' + i], days:d, qty:q }); } }
  const visit = { id:nextId(db, 'visit'), patient:a.patient, doctor:a.doctor, appt:a.id, date:todayStr(), symptoms:f.symptoms, vitals:{ bp:f.bp, pulse:+f.pulse || 0, temp:+f.temp || 0, spo2:+f.spo2 || 0, weight:+f.weight || 0 }, notes:f.notes || '-', diagnosis:f.diagnosis, plan:f.plan, followUp:f.followup || null };
  db.visits.push(visit); a.visit = visit.id; a.status = 'Completed';
  if (items.length) db.prescriptions.push({ id:nextId(db, 'rx'), visit:visit.id, patient:a.patient, doctor:a.doctor, date:todayStr(), status:'Pending', items });
  if (f.labs && f.labs.length) db.labOrders.push({ id:nextId(db, 'lab'), patient:a.patient, doctor:a.doctor, visit:visit.id, date:todayStr(), status:'Ordered', tests:f.labs.map(c => { const t = db.labTests.find(x => x.code === c); return { code:c, name:t.name, price:t.price, result:'', flag:'' }; }), verifiedBy:'' });
  if (f.followup) db.appointments.push({ id:nextId(db, 'appointment'), patient:a.patient, doctor:a.doctor, date:f.followup, time:'10:00', type:'Scheduled', reason:'Follow-up: ' + f.diagnosis, status:'Booked', token:null, visit:null, createdAt:todayStr() });
  audit('Consultation completed', visit.id + ' for ' + a.patient); save(); route = { m:'opd', p:{} }; render();
  toast('Consultation saved' + (items.length ? ', prescription created' : '') + (f.labs && f.labs.length ? ', lab order sent' : ''), 'ok'); A.visitSummary(visit.id);
});
def('visitSummary', id => {
  const v = byId(db.visits, id); const p = P(v.patient); const rx = db.prescriptions.find(x => x.visit === id); const lo = db.labOrders.filter(x => x.visit === id);
  showDoc('Visit summary', `${docHead('Visit summary')}<table><tr><td>Patient</td><td><b>${esc(p.name)}</b> (${p.id})</td><td>Date</td><td>${fdate(v.date)}</td></tr><tr><td>Age / sex</td><td>${age(p.dob)} / ${esc(p.gender)}</td><td>Doctor</td><td>${esc(DOC(v.doctor).name)}</td></tr></table>
  <p><b>Vitals:</b> BP ${esc(v.vitals.bp)}, pulse ${v.vitals.pulse}/min, temperature ${v.vitals.temp} F, SpO2 ${v.vitals.spo2}%, weight ${v.vitals.weight} kg</p><p><b>Symptoms:</b> ${esc(v.symptoms)}</p><p><b>Examination:</b> ${esc(v.notes)}</p><p><b>Diagnosis:</b> ${esc(v.diagnosis)}</p><p><b>Treatment plan:</b> ${esc(v.plan)}</p>
  ${rx ? `<b>Prescription ${rx.id}</b><table><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th><th>Qty</th></tr>${rx.items.map(i => `<tr><td>${esc(byId(db.medicines, i.med).name)}</td><td>${esc(i.dose)}</td><td>${esc(i.freq)}</td><td>${i.days}</td><td>${i.qty}</td></tr>`).join('')}</table>` : ''}
  ${lo.length ? `<p><b>Lab tests ordered:</b> ${lo.map(l => esc(l.id) + ' (' + esc(l.tests.map(t => t.name).join(', ')) + ')').join('; ')}</p>` : ''}${v.followUp ? `<p><b>Follow-up:</b> ${fdate(v.followUp)}</p>` : ''}<div class="sig"><span>Patient signature</span><span>${esc(DOC(v.doctor).name)}</span></div>`);
});
def('printRx', id => {
  const x = byId(db.prescriptions, id); const p = P(x.patient);
  showDoc('Prescription', `${docHead('Prescription ' + x.id)}<p><b>${esc(p.name)}</b> (${p.id}), ${age(p.dob)} yrs, ${esc(p.gender)} | Allergies: ${esc(p.allergies)}</p><table><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th><th>Qty</th></tr>${x.items.map(i => `<tr><td>${esc(byId(db.medicines, i.med).name)}</td><td>${esc(i.dose)}</td><td>${esc(i.freq)}</td><td>${i.days}</td><td>${i.qty}</td></tr>`).join('')}</table><div class="sig"><span>${fdate(x.date)}</span><span>${esc(DOC(x.doctor).name)}</span></div>`, false);
});

/* ---------------- doctors and staff ---------------- */
VIEWS.staff = () => {
  const tab = ST.stab || 'doctors'; const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let body;
  if (tab === 'doctors') body = table(['Doctor', 'Department', 'Qualification', 'Fee', 'Days / hours', 'Room', 'Staff ID'], db.doctors.map(d => [`<b>${esc(d.name)}</b>`, esc(deptName(d.dept)), esc(d.qual), money(d.fee), esc(d.days) + '<div class="sm mut">' + d.slots + '</div>', esc(d.room), `<span class="mono">${d.staffId}</span>`]));
  else if (tab === 'staff') body = table(['Staff ID', 'Name', 'Role', 'Department', 'Shift', 'Phone'], db.staff.map(s => [`<span class="mono">${s.id}</span>`, esc(s.name), esc(ROLES[s.role].label), esc(s.dept), esc(s.shift), esc(s.phone)]));
  else body = table(['Staff', 'Shift', ...days], db.staff.filter(s => s.role !== 'doctor').map((s, i) => [esc(s.name) + '<div class="sm mut">' + esc(ROLES[s.role].short) + '</div>', esc(s.shift), ...days.map((d, k) => (k + i) % 7 === 6 ? '<span class="mut">Off</span>' : `<span class="badge ${s.shift === 'Night' ? 'info' : 'teal'}">${s.shift[0]}</span>`)]));
  return `<div class="head"><div><h1>Doctors and staff</h1><p>${db.doctors.length} doctors, ${db.staff.length - db.doctors.length} staff members</p></div>
  <div class="row">${can('staff.manage') ? `${tab === 'doctors' ? `<button class="btn p" onclick="A.newDoctor()">Add doctor</button>` : ''}<button class="btn ${tab === 'doctors' ? '' : 'p'}" onclick="A.newStaff()">Add staff member</button>` : ''}</div></div>
  ${tabs([['doctors', 'Doctors'], ['staff', 'All staff'], ['roster', 'Duty roster']], tab, 'A.stab')}<div class="card">${body}</div>`;
};
def('stab', t => { ST.stab = t; render(); });
def('newStaff', () => { need('staff.manage'); openModal({ title:'Add staff member', body:`<div class="note" style="margin-bottom:12px">To add a doctor, use <b>Add doctor</b> so they get a schedule, consultation fee and room.</div><div id="sf" class="form">${field('Full name *', '<input name="name">')}${field('Role *', `<select name="role">${Object.keys(ROLES).filter(r => r !== 'doctor').map(r => `<option value="${r}">${ROLES[r].label}</option>`).join('')}</select>`)}${field('Department', '<input name="dept">')}${field('Shift', '<select name="shift"><option>Day</option><option>Evening</option><option>Night</option></select>')}${field('Phone', '<input name="phone">')}</div>`, footer:`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn p" onclick="A.saveStaff()">Add staff member</button>` }); });
def('saveStaff', () => { need('staff.manage'); const f = fv('sf'); if (f.name.length < 3) throw new VErr('Enter the staff member\'s name.'); const s = { id:nextId(db, 'staff'), name:f.name, role:f.role, dept:f.dept || '-', shift:f.shift, phone:f.phone || '-', active:true }; db.staff.push(s); audit('Staff added', s.id); closeModal(); commit('Added ' + s.name + ' as ' + s.id); });

/* doctors are a separate list (schedule, fee, room) and also get a staff row */
function nextDoctorId() {
  db.seq.doctor = (db.seq.doctor || 0) + 1;
  let id = 'D' + db.seq.doctor;
  while (db.doctors.some(d => d.id === id)) { db.seq.doctor++; id = 'D' + db.seq.doctor; }
  return id;
}
def('newDoctor', () => {
  need('staff.manage');
  const room = 'OPD-' + (101 + db.doctors.length);
  openModal({ title:'Add doctor', wide:true, body:`<div id="docf" class="form">
    ${field('Full name *', '<input name="name" placeholder="Dr. First Last">')}
    ${field('Department *', `<select name="dept">${opt(db.departments, d => d.id, d => d.name)}</select>`)}
    ${field('Qualification *', '<input name="qual" placeholder="e.g. MBBS, MD">')}
    ${field('Consultation fee (INR) *', '<input name="fee" type="number" min="1" step="50" value="500">')}
    ${field('OPD days *', `<select name="days">${['Mon-Sat', 'Mon-Fri', 'Tue-Sun', 'All days'].map(x => `<option>${x}</option>`).join('')}</select>`)}
    ${field('Consultation hours *', '<input name="slots" value="09:00-14:00" placeholder="09:00-14:00">')}
    ${field('Room', `<input name="room" value="${esc(room)}">`)}
    ${field('Phone', '<input name="phone" inputmode="numeric" maxlength="10" placeholder="Optional">')}
  </div><div class="note" style="margin-top:12px">Adding a doctor also creates their staff record, so they appear in the staff list and duty roster, and can be booked in Appointments.</div>`,
    footer:`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn p" onclick="A.saveDoctor()">Add doctor</button>` });
});
def('saveDoctor', () => {
  need('staff.manage'); const f = fv('docf');
  if (f.name.length < 4) throw new VErr('Enter the doctor\'s full name.');
  if (!f.qual) throw new VErr('Enter the qualification.');
  if (!(+f.fee > 0)) throw new VErr('Enter a consultation fee greater than 0.');
  if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(f.slots)) throw new VErr('Enter consultation hours like 09:00-14:00.');
  if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) throw new VErr('Enter a valid 10-digit mobile number, or leave it blank.');
  if (db.doctors.some(d => d.name.toLowerCase() === f.name.toLowerCase())) throw new VErr('A doctor with this name is already on the list.');
  const staffId = nextId(db, 'staff');
  const d = { id:nextDoctorId(), staffId, name:f.name, dept:f.dept, qual:f.qual, fee:+f.fee, days:f.days, slots:f.slots, room:f.room || 'OPD-' + (101 + db.doctors.length), active:true };
  db.doctors.push(d);
  db.staff.push({ id:staffId, name:d.name, role:'doctor', dept:deptName(d.dept), shift:'OPD', phone:f.phone || '-', active:true });
  audit('Doctor added', d.id + ' ' + d.name); closeModal(); ST.stab = 'doctors'; commit(d.name + ' added as ' + d.id + ' (' + deptName(d.dept) + ')');
});
