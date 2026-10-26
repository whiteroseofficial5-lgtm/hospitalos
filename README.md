# WhiteRose HospitalOS - Client Demo

A single-file hospital management demo for **WhiteRose Demo Multispeciality Hospital** (fictional, hospital ID `WR-HSP-000001`).
Built by WhiteRose - Cybersecurity and Software Development.

## How to run (Windows 11)
1. Unzip the folder.
2. Double-click `WhiteRose-HospitalOS-Demo.html`. It opens in Chrome or Edge. No install, no internet, no database needed.
3. Sign in with a demo account below, or use the "View as" box at the top to switch role instantly.

Everything you do is saved in the browser (localStorage), so it survives a refresh.
To start fresh: sign in as admin, click **Demo walkthrough** (left sidebar), then **Reset demo data**.

## Demo accounts (development only)
| Role | Username | Password |
|---|---|---|
| Hospital Administrator | admin | Admin@123 |
| Receptionist | reception | Reception@123 |
| Doctor | doctor | Doctor@123 |
| Nurse | nurse | Nurse@123 |
| Laboratory Technician | lab | Lab@123 |
| Pharmacist | pharmacist | Pharma@123 |
| Accountant | accountant | Accounts@123 |
| Inventory Manager | inventory | Stores@123 |

## Live demo script (about 8 minutes)
Open **Demo walkthrough** in the sidebar. Each step has a Go button that switches to the right role.
1. Admin: register a patient. The permanent ID (WR-PAT-0000xx) and QR card appear. Print the card or the registration slip.
2. Reception: book an appointment, or use Walk-in (it checks in and issues a token straight away).
3. Doctor: open OPD, start the consultation, add vitals, diagnosis, prescription, a lab test and a follow-up date. A printable visit summary opens.
4. Lab technician: collect sample, process, enter result, verify, print report.
5. Pharmacist: dispense the prescription. Watch stock fall (earliest-expiry batch first) and the amount reach the invoice.
6. Accountant: Billing > Ready to bill > Generate invoice (consultation + lab + pharmacy). Record a partial payment, then the rest. Print or save as PDF.
7. Admin: IPD and beds > admit another patient to a free bed. Try the same bed twice (it is refused). Transfer to another bed, then discharge and print the discharge summary.
8. Admin: Dashboard and Reports update. Export any report to CSV.

## What is in the demo
Dashboard (role-specific), patients with QR cards, appointments and queue tokens, OPD and medical records, doctors and staff with duty roster, IPD with bed map, laboratory, pharmacy with batches and expiry, inventory with QR labels and purchase orders, billing with partial payments and refunds, seven reports with CSV export and print, and an audit log.

Seed data: 9 doctors, 26 staff, 46 patients, 26 appointments, 5 active admissions, 30 beds in 5 wards, 10 lab tests, 15 medicines with batches, 12 supply items, and paid, partial and pending invoices.

## Honest notes for the client conversation
- This is a **front-end demo**. Data lives in the browser, not a server. The production version uses Next.js, PostgreSQL and Prisma, with permissions enforced on the server. In this demo the permission rules run in one central check, and every action is audited, including denied attempts.
- The "View as" box is a demo shortcut and would not exist in production.
- All payments are **simulated**. No gateway is called and no real money moves.
- QR codes contain only the patient ID and a lookup key, never medical details. Opening a record needs a signed-in, authorised user.
- "Print / Save as PDF" uses the browser print dialog. Choose "Save as PDF" as the printer.
- Every name, phone number and record is fictional.

## Folder
- `WhiteRose-HospitalOS-Demo.html` - the demo (open this)
- `source/` - readable source files and the build script (`cd source` then `node build.js`, needs Node.js)
