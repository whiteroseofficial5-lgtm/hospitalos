/* ===== WhiteRose HospitalOS demo: data layer (browser, localStorage) ===== */
const STORE_KEY = 'wr_hospitalos_demo_v1';
const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
const iso = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0,10); };
const addDays = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return iso(d); };
const todayStr = () => iso(TODAY);

/* deterministic random so every demo reset looks the same */
let _s = 20260711;
const rnd = () => (_s = (_s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const PREFIX = { hospital:'WR-HSP', patient:'WR-PAT', appointment:'WR-APT', admission:'WR-ADM', bill:'WR-INV', lab:'WR-LAB', rx:'WR-RX', staff:'WR-STF', inv:'WR-ITM', po:'WR-PO', visit:'WR-VIS', pay:'WR-PAY', sale:'WR-SAL' };
/* counter based generator (a sequence per entity, never MAX+1) */
function nextId(db, kind) {
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return PREFIX[kind] + '-' + String(db.seq[kind]).padStart(6, '0');
}

const ROLES = {
  admin:{ label:'Hospital Administrator', short:'Administrator' },
  reception:{ label:'Receptionist', short:'Reception' },
  doctor:{ label:'Doctor', short:'Doctor' },
  nurse:{ label:'Nurse', short:'Nurse' },
  lab:{ label:'Laboratory Technician', short:'Lab' },
  pharmacist:{ label:'Pharmacist', short:'Pharmacy' },
  accountant:{ label:'Accountant', short:'Accounts' },
  inventory:{ label:'Inventory Manager', short:'Inventory' },
};
const DEMO_USERS = [
  { user:'admin',      role:'admin',      name:'Dr. Meera Kulkarni',   pass:'Admin@123' },
  { user:'reception',  role:'reception',  name:'Pooja Shinde',         pass:'Reception@123' },
  { user:'doctor',     role:'doctor',     name:'Dr. Arjun Deshmukh',   pass:'Doctor@123', doctorId:'D1' },
  { user:'nurse',      role:'nurse',      name:'Sister Anita Fernandes', pass:'Nurse@123' },
  { user:'lab',        role:'lab',        name:'Rohan Patil',          pass:'Lab@123' },
  { user:'pharmacist', role:'pharmacist', name:'Kavita Joshi',         pass:'Pharma@123' },
  { user:'accountant', role:'accountant', name:'Sanjay Mehta',         pass:'Accounts@123' },
  { user:'inventory',  role:'inventory',  name:'Imran Sheikh',         pass:'Stores@123' },
];

function buildSeed() {
  _s = 20260711;
  const db = { v:1, seq:{}, audit:[], notifications:[] };
  db.hospital = {
    id: 'WR-HSP-000001', name:'WhiteRose Demo Multispeciality Hospital',
    address:'Plot 12, Health City Road, Andheri East, Mumbai 400069', phone:'+91 22 5555 0100', email:'care@demo-hospital.example',
    gstin:'27AAAAA0000A1Z5 (demo)', invoicePrefix:'WR-INV', invoiceNote:'This is a demo invoice. No real payment was taken.',
  };
  db.seq.hospital = 1;

  db.departments = ['General Medicine','Cardiology','Orthopaedics','Paediatrics','Gynaecology','ENT','Dermatology','Neurology'].map((n,i)=>({ id:'DEP'+(i+1), name:n }));
  const dn = n => db.departments.find(d=>d.name===n).id;

  const docs = [
    ['Dr. Arjun Deshmukh','General Medicine','MBBS, MD',500,'Mon-Sat'],
    ['Dr. Neha Kapoor','Cardiology','MBBS, DM Cardiology',900,'Mon-Fri'],
    ['Dr. Rahul Bhatt','Orthopaedics','MBBS, MS Ortho',800,'Mon-Sat'],
    ['Dr. Sunita Rao','Paediatrics','MBBS, DCH',600,'Mon-Sat'],
    ['Dr. Farah Siddiqui','Gynaecology','MBBS, MS OBG',700,'Mon-Sat'],
    ['Dr. Vikram Nair','ENT','MBBS, MS ENT',600,'Tue-Sun'],
    ['Dr. Isha Malhotra','Dermatology','MBBS, MD Derm',650,'Mon-Fri'],
    ['Dr. Pranav Iyer','Neurology','MBBS, DM Neurology',1000,'Mon-Fri'],
    ['Dr. Kiran Gokhale','General Medicine','MBBS, DNB',500,'Mon-Sat'],
  ];
  db.doctors = docs.map((d,i)=>({ id:'D'+(i+1), staffId:null, name:d[0], dept:dn(d[1]), qual:d[2], fee:d[3], days:d[4], slots:i%2?'10:00-16:00':'09:00-14:00', room:'OPD-'+(101+i), active:true }));
  db.seq.doctor = db.doctors.length; /* doctors use the short D1..Dn form, kept in the same counter store */

  const staffRows = [
    ['Dr. Meera Kulkarni','admin','Administration','Day'],['Pooja Shinde','reception','Front desk','Day'],['Ankita More','reception','Front desk','Evening'],
    ['Sister Anita Fernandes','nurse','Nursing','Day'],['Sister Rekha Nair','nurse','Nursing','Night'],['Sister Joyce D\'Souza','nurse','Nursing','Evening'],['Brother Santosh Pawar','nurse','Nursing','Night'],
    ['Rohan Patil','lab','Laboratory','Day'],['Deepa Kamat','lab','Laboratory','Evening'],
    ['Kavita Joshi','pharmacist','Pharmacy','Day'],['Nilesh Gawade','pharmacist','Pharmacy','Evening'],
    ['Sanjay Mehta','accountant','Accounts','Day'],['Priti Sawant','accountant','Accounts','Day'],
    ['Imran Sheikh','inventory','Stores','Day'],['Ganesh Kale','inventory','Stores','Evening'],
    ['Harish Yadav','nurse','Ward support','Night'],['Lata Bhosale','reception','Front desk','Night'],
  ];
  db.staff = staffRows.map((r,i)=>({ id:nextId(db,'staff'), name:r[0], role:r[1], dept:r[2], shift:r[3], phone:'98200'+String(10000+i*37).slice(-5), active:true }));
  db.doctors.forEach((d,i)=>{ d.staffId = nextId(db,'staff'); db.staff.push({ id:d.staffId, name:d.name, role:'doctor', dept:db.departments.find(x=>x.id===d.dept).name, shift:'OPD', phone:'98190'+String(20000+i*53).slice(-5), active:true }); });

  /* patients */
  const fn = ['Aarav','Vihaan','Aditya','Rohit','Karan','Sahil','Manish','Suresh','Ramesh','Imran','Faisal','Nikhil','Omkar','Yash','Tushar','Anil','Dinesh','Prakash','Harsh','Jayesh'];
  const fnf = ['Priya','Anjali','Sneha','Neha','Pooja','Riya','Kavya','Meena','Sunita','Lata','Fatima','Zoya','Shweta','Ritu','Komal','Asha','Divya','Swati','Mansi','Tanvi'];
  const ln = ['Sharma','Patil','Desai','Jadhav','Khan','Shaikh','Gupta','Mehta','Nair','Iyer','Kulkarni','Pawar','More','Singh','Verma','Chavan','Joshi','Shetty','Dsouza','Menon'];
  const allergies = ['None known','None known','None known','Penicillin','Sulfa drugs','Dust / pollen','Peanuts','None known'];
  const hist = ['None','Hypertension','Type 2 diabetes','Asthma','Thyroid disorder','None','Migraine','Previous appendectomy','None'];
  const areas = ['Andheri East','Powai','Goregaon','Malad','Kandivali','Borivali','Jogeshwari','Vile Parle','Bandra','Santacruz'];
  db.patients = [];
  for (let i=0;i<46;i++) {
    const female = i%2===1; const age = ri(2,78);
    const dob = new Date(TODAY); dob.setFullYear(dob.getFullYear()-age); dob.setDate(dob.getDate()-ri(0,300));
    const name = (female?pick(fnf):pick(fn)) + ' ' + pick(ln);
    db.patients.push({
      id: nextId(db,'patient'), name, gender: female?'Female':'Male', dob: iso(dob),
      phone: '9' + String(ri(100000000,999999999)), email:'', bloodGroup: pick(['A+','B+','O+','AB+','O-','A-','B-']),
      address: ri(1,99)+', '+pick(areas)+', Mumbai', emergencyName: pick(fn)+' '+pick(ln), emergencyPhone:'9'+String(ri(100000000,999999999)),
      allergies: pick(allergies), history: pick(hist), createdAt: addDays(-ri(1,200)), token: Math.random().toString(36).slice(2,10),
    });
  }

  /* wards and beds */
  const wardDef = [['General Ward A',8,1200,'Male'],['General Ward B',8,1200,'Female'],['Private Rooms',6,3500,'Any'],['ICU',4,7500,'Any'],['Maternity',4,2500,'Female']];
  db.wards = []; db.beds = [];
  wardDef.forEach((w,wi)=>{
    const wid='W'+(wi+1); db.wards.push({ id:wid, name:w[0], rate:w[2], type:w[3] });
    for (let b=1;b<=w[1];b++) db.beds.push({ id:wid+'-B'+b, ward:wid, label:(wi===2?'Room ':'Bed ')+b, status:'free', rate:w[2] });
  });
  db.beds.find(b=>b.id==='W1-B8').status='maintenance';

  /* lab catalogue */
  db.labTests = [
    ['CBC','Complete blood count',350,'Hematology','Hb 13.0-17.0 g/dL; WBC 4000-11000'],['FBS','Fasting blood sugar',120,'Biochemistry','70-100 mg/dL'],['HBA1C','HbA1c',550,'Biochemistry','< 5.7 %'],
    ['LIPID','Lipid profile',700,'Biochemistry','LDL < 100 mg/dL'],['LFT','Liver function test',800,'Biochemistry','ALT 7-56 U/L'],['KFT','Kidney function test',750,'Biochemistry','Creatinine 0.6-1.3 mg/dL'],
    ['TSH','Thyroid stimulating hormone',450,'Hormones','0.4-4.0 mIU/L'],['UR','Urine routine',150,'Pathology','Clear, no protein'],['XRAY','Chest X-ray (report)',500,'Radiology','As per radiologist'],['ECG','Electrocardiogram',300,'Cardiology','Normal sinus rhythm'],
  ].map(t=>({ code:t[0], name:t[1], price:t[2], dept:t[3], range:t[4] }));

  /* pharmacy */
  db.suppliers = [
    { id:'S1', name:'MediSupply Distributors (demo)', phone:'022 5555 0111', type:'Medicine' },
    { id:'S2', name:'CareLine Pharma Wholesale (demo)', phone:'022 5555 0122', type:'Medicine' },
    { id:'S3', name:'SteriCore Hospital Supplies (demo)', phone:'022 5555 0133', type:'Supplies' },
    { id:'S4', name:'BioMed Equipments (demo)', phone:'022 5555 0144', type:'Equipment' },
  ];
  const meds = [
    ['Paracetamol 500 mg','Tablet',2.0,40,'Analgesic'],['Amoxicillin 500 mg','Capsule',9,40,'Antibiotic'],['Azithromycin 500 mg','Tablet',22,30,'Antibiotic'],['Metformin 500 mg','Tablet',3,60,'Antidiabetic'],
    ['Amlodipine 5 mg','Tablet',4,50,'Antihypertensive'],['Atorvastatin 10 mg','Tablet',8,50,'Statin'],['Pantoprazole 40 mg','Tablet',7,40,'Antacid'],['Cetirizine 10 mg','Tablet',2.5,40,'Antihistamine'],
    ['ORS sachet','Sachet',18,30,'Rehydration'],['Salbutamol inhaler','Inhaler',160,10,'Respiratory'],['Ibuprofen 400 mg','Tablet',3,40,'Analgesic'],['Vitamin D3 60K','Capsule',45,20,'Supplement'],
    ['Diclofenac gel 30 g','Tube',85,10,'Topical'],['Normal saline 500 ml','Bottle',55,20,'IV fluid'],['Ondansetron 4 mg','Tablet',6,30,'Antiemetic'],
  ];
  db.medicines = meds.map((m,i)=>({ id:'M'+(i+1), name:m[0], form:m[1], price:m[2], reorder:m[3], category:m[4], supplier:i%2?'S2':'S1' }));
  db.batches = [];
  db.medicines.forEach((m,i)=>{
    const lowCase = (i===3||i===9||i===13);
    db.batches.push({ id:'B'+m.id+'A', med:m.id, batchNo:'WR'+(2400+i)+'A', expiry:addDays(lowCase? 400 : ri(200,700)), qty: lowCase? ri(4,14) : ri(60,200) });
    if (i%3===0) db.batches.push({ id:'B'+m.id+'B', med:m.id, batchNo:'WR'+(2300+i)+'B', expiry:addDays(i===0?25:ri(40,120)), qty:ri(15,40) });
  });
  db.medicines[0].price=2; /* keep price stable */
  db.sales=[]; db.tokens={};

  /* inventory */
  const inv = [
    ['Surgical gloves (box 100)','Consumables','box',45,60,'S3'],['Disposable syringes 5 ml','Consumables','pcs',700,500,'S3'],['N95 masks','Consumables','pcs',120,150,'S3'],['Bandage roll','Consumables','pcs',220,100,'S3'],
    ['IV cannula 20G','Consumables','pcs',90,120,'S3'],['Bed linen set','Linen','set',60,40,'S3'],['Wheelchair','Equipment','unit',8,3,'S4'],['Pulse oximeter','Equipment','unit',14,5,'S4'],
    ['Oxygen cylinder (D type)','Equipment','unit',12,6,'S4'],['Infusion pump','Equipment','unit',9,4,'S4'],['Printer paper A4','Office','ream',18,10,'S3'],['Hand sanitizer 500 ml','Consumables','bottle',64,40,'S3'],
  ];
  db.items = inv.map(r=>({ id:nextId(db,'inv'), name:r[0], category:r[1], unit:r[2], qty:r[3], min:r[4], supplier:r[5] }));
  db.stockMoves = db.items.slice(0,6).map(it=>({ id:'MV'+String(db.seq.mv=(db.seq.mv||0)+1).padStart(5,'0'), item:it.id, type:'in', qty:it.qty, dept:'', ref:'Opening stock', by:'System', at:addDays(-20) }));
  db.pos = [{ id:nextId(db,'po'), supplier:'S3', status:'Received', at:addDays(-12), lines:[{ item:db.items[1].id, qty:500, cost:6 }], total:3000 }, { id:nextId(db,'po'), supplier:'S4', status:'Ordered', at:addDays(-3), lines:[{ item:db.items[7].id, qty:6, cost:1800 }], total:10800 }];

  /* appointments + visits + invoices */
  db.appointments=[]; db.visits=[]; db.prescriptions=[]; db.labOrders=[]; db.admissions=[]; db.invoices=[]; db.payments=[];
  const slotList = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','14:00','14:30','15:00'];
  const tokenCount = {};
  const mkTok = (docId, date) => { const k=docId+date; tokenCount[k]=(tokenCount[k]||0)+1; return tokenCount[k]; };
  const complaints = ['Fever and body ache for 3 days','Persistent cough','Chest discomfort on exertion','Knee pain','Routine antenatal check','Skin rash','Ear pain','Headache and dizziness','Child with cold and fever','High blood sugar review','Back pain','Follow-up visit'];
  for (let i=0;i<26;i++) {
    const p = db.patients[i%db.patients.length]; const doc = db.doctors[i%db.doctors.length];
    const dayOff = i<9 ? 0 : (i<17 ? -ri(1,6) : ri(1,5));
    const date = addDays(dayOff);
    let status = dayOff<0 ? 'Completed' : dayOff>0 ? 'Booked' : pick(['Booked','Checked-in','Checked-in','In consultation','Completed','Booked','Completed']);
    const a = { id:nextId(db,'appointment'), patient:p.id, doctor:doc.id, date, time:slotList[i%slotList.length], type:(i%5===0?'Walk-in':'Scheduled'), reason:complaints[i%complaints.length], status, token: status==='Booked'&&dayOff>0 ? null : mkTok(doc.id,date), visit:null, createdAt:addDays(Math.min(dayOff,0)-1) };
    if (status==='Completed') {
      const v = { id:nextId(db,'visit'), patient:p.id, doctor:doc.id, appt:a.id, date, symptoms:a.reason, vitals:{ bp:pick(['118/76','124/82','132/86','110/70']), pulse:ri(64,96), temp:pick([98.4,98.6,99.8,100.4]), spo2:ri(95,99), weight:ri(48,84) }, notes:'Examined. General condition stable.', diagnosis:pick(['Viral fever','Upper respiratory infection','Hypertension, stage 1','Mechanical back pain','Acute gastritis','Allergic rhinitis','Type 2 diabetes, review']), plan:'Medication as prescribed, adequate rest and fluids.', followUp:null };
      a.visit=v.id; db.visits.push(v);
      const rx = { id:nextId(db,'rx'), visit:v.id, patient:p.id, doctor:doc.id, date, status: dayOff<0?'Dispensed':'Pending', items:[ { med:'M1', dose:'1 tab', freq:'Twice daily', days:3, qty:6 }, { med:pick(['M8','M7','M2']), dose:'1', freq:'Once daily', days:5, qty:5 } ] };
      db.prescriptions.push(rx);
    }
    db.appointments.push(a);
  }
  db.tokens = tokenCount;
  /* lab orders in all states */
  const states = ['Ordered','Sample collected','Processing','Resulted','Verified','Verified','Ordered','Resulted'];
  db.visits.slice(0,8).forEach((v,i)=>{
    const t = db.labTests[i%db.labTests.length]; const st = states[i];
    const lo = { id:nextId(db,'lab'), patient:v.patient, doctor:v.doctor, visit:v.id, date:v.date, status:st, tests:[{ code:t.code, name:t.name, price:t.price, result: (st==='Resulted'||st==='Verified') ? sampleResult(t) : '', flag:(st==='Resulted'||st==='Verified') ? (i%3===0?'High':'Normal') : '' }], verifiedBy: st==='Verified' ? 'Rohan Patil' : '' };
    db.labOrders.push(lo);
  });
  /* invoices (paid, partial, pending) */
  const inv0 = [ 'Paid','Partial','Pending','Paid','Pending','Partial','Paid','Pending','Paid','Partial' ];
  db.visits.slice(0,16).forEach((v,i)=>{
    const d = db.doctors.find(x=>x.id===v.doctor);
    const lines=[{ desc:'Consultation - '+d.name, cat:'Consultation', qty:1, price:d.fee }];
    if (i%2===0) lines.push({ desc:'Lab: Complete blood count', cat:'Laboratory', qty:1, price:350 });
    if (i%3===0) lines.push({ desc:'Pharmacy: Paracetamol 500 mg x 6', cat:'Pharmacy', qty:1, price:12 });
    const total = lines.reduce((s,l)=>s+l.qty*l.price,0);
    const invoice = { id:nextId(db,'bill'), patient:v.patient, visit:v.id, admission:null, date:v.date, lines, discount:0, total, paid:0, refunded:0, status:inv0[i%10], createdBy:'System' };
    const paid = inv0[i%10]==='Paid' ? total : inv0[i%10]==='Partial' ? Math.round(total/2) : 0;
    invoice.discount=0; if (paid) { invoice.paid = paid; db.payments.push({ id:nextId(db,'pay'), invoice:invoice.id, amount:paid, method:pick(['Cash','UPI','Card','Bank transfer']), at:v.date, ref:'SIM-'+ri(100000,999999), type:'payment' }); }
    db.invoices.push(invoice);
  });
  /* some payments today for collections chart variety */
  /* admissions */
  const adm = [[20,'W1-B1','Pneumonia','D1',-4],[23,'W2-B1','Post-operative care','D3',-2],[27,'W3-B2','Chest pain observation','D2',-1],[30,'W4-B1','Post-stroke monitoring','D8',-3],[33,'W5-B1','Labour and delivery','D5',0]];
  adm.forEach(a=>{
    const p = db.patients[a[0]]; const bed = db.beds.find(b=>b.id===a[1]);
    bed.status='occupied';
    db.admissions.push({ id:nextId(db,'admission'), patient:p.id, doctor:a[3], bed:a[1], diagnosis:a[2], admittedAt:addDays(a[4]), status:'Admitted', history:[{ bed:a[1], from:addDays(a[4]), to:null }], dischargedAt:null, summary:'' });
  });
  /* one past discharge */
  db.admissions.push({ id:nextId(db,'admission'), patient:db.patients[36].id, doctor:'D1', bed:'W1-B3', diagnosis:'Dengue fever', admittedAt:addDays(-9), status:'Discharged', history:[{ bed:'W1-B3', from:addDays(-9), to:addDays(-5) }], dischargedAt:addDays(-5), summary:'Platelets recovered. Discharged in stable condition with oral hydration advice.' });

  db.audit.push({ at:new Date().toISOString(), user:'System', role:'system', action:'Demo data created', detail:'Fictional data loaded' });
  return db;
}
function sampleResult(t){
  const m = { CBC:'Hb 13.6 g/dL, WBC 7,400 /uL, Platelets 2.4 lakh', FBS:'96 mg/dL', HBA1C:'6.3 %', LIPID:'LDL 128 mg/dL, HDL 44 mg/dL', LFT:'ALT 32 U/L, AST 28 U/L', KFT:'Creatinine 0.9 mg/dL', TSH:'2.1 mIU/L', UR:'Clear, protein absent', XRAY:'No active lung lesion', ECG:'Normal sinus rhythm' };
  return m[t.code]||'Within normal limits';
}
