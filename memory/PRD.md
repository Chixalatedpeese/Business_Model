# Commerical Trading - Business Management System PRD

## Original Problem Statement
Simple, fast, practical business management system for a Sri Lankan trading/distribution business (order-based model, low inventory, supplier-driven fulfillment). Remove purchase tab dependency — supplier payables auto-update when orders are placed.

## Architecture
- **Frontend**: React + Shadcn UI + Tailwind CSS + Recharts
- **Backend**: FastAPI (Python) + MongoDB (motor)
- **Auth**: JWT-based with httpOnly cookies
- **Currency**: Sri Lankan Rupees (Rs. X.XX format, never ₹)
- **Database**: MongoDB with UUID-based document IDs

## User Personas
- **Business Owner/Admin**: Manages orders, invoices, payments, profit
- **Staff**: Creates orders, generates invoices, records payments

## Core Requirements
1. Customer Management (CRUD + profile page with financial analytics)
2. Supplier Management (CRUD + profile page with fast-moving items)
3. Product Catalog (CRUD, no categories; Enter-key form flow)
4. Order Management (multi-item, per-item supplier assignment, auto-creates supplier payables)
5. Auto Supplier Payable (no manual purchase entry needed)
6. Invoice System (B5 landscape print, Shop Name prominent, Paid/Unpaid filter)
7. Payment Tracking (cash/bank/transfer/cheque with cheque details; multi-invoice allocations)
8. Dashboard (Receivables, Payables, Total Profit, Monthly Sales; quick actions; sales trend chart)
9. Reports (Customer outstanding, Global outstanding, Supplier payable — all printable)
10. Analytics APIs (Sales, Purchases, Profit for 30d/60d/90d/1y/all)

## Implementation History

### MVP + Phase 1 (April 2026)
- JWT auth (login/register/logout/forgot-password with OTP in JSON response)
- All core CRUD modules, sidebar navigation, responsive layout
- "Commerical Trading" branding, LKR (Rs.) currency, category field removed, empty defaults

### Phase 2 — Core Workflow (Feb 20, 2026) ✅ COMPLETE
**Backend**
- `POST/PUT /api/orders`: auto-creates supplier purchases via `sync_order_purchases` (no manual purchase entry needed)
- Order item snapshots `cost_price` at creation time (prevents payable drift on price changes)
- `PUT /api/orders/{id}/status` supports forward + backward (undo) transitions
- `POST /api/payments` with `allocations[]` array, cheque fields (cheque_number, bank_name, cheque_date), methods: cash/bank/transfer/cheque (UPI removed)
- Payment-allocation-based invoice status (unpaid→partial→paid) recalculated on add/delete
- `GET /api/invoices?status=...` filter; paid_amount aggregated from allocations (not legacy reference_id)
- `GET /api/customers/{id}` → outstanding + invoices + payments + orders + monthly_avg_sales + highest_invoice + last_payment + most_purchased_product
- `GET /api/suppliers/{id}` → payable + purchases + payments + fast_moving_items + last_payment
- `GET /api/reports/customer-outstanding/{id}`, `/global-outstanding`, `/supplier-payable`
- `GET /api/analytics/sales|purchases|profit?period=30d|60d|90d|1y|all`
- `GET /api/dashboard/summary` adds `total_profit`

**Frontend**
- Routing: `/customers/:id`, `/suppliers/:id`, `/reports` routes added in App.js
- Sidebar: new "Reports" nav item
- DashboardPage: 4 metric cards (Receivables, Payables, Total Profit, Monthly Sales) with click-to-reports on Receivables/Payables; Quick Actions row (New Order, New Invoice, Record Payment, Reports)
- CustomerProfilePage / SupplierProfilePage / ReportsPage — all rendering correctly
- CustomersPage / SuppliersPage: row click → profile page
- ProductsPage: Enter-key flow (Name → Selling Price → Cost Price → Create)
- OrdersPage: per-item profit + total profit in detail dialog; Undo buttons for status regressions
- PaymentsPage: UPI removed; Cheque reveals Cheque No / Bank / Date inputs; table shows cheque info
- InvoicesPage: Paid/Unpaid/Partial filter; Shop Name primary Bill-To; B5 landscape @page CSS
- index.js: ResizeObserver warning suppression

**Testing (iteration_3.json)**
- Backend: 18/18 pytest cases passed (100%)
- Frontend: core flows validated — Dashboard, Profiles, Reports, Products Enter-key, Invoice filter, UPI removal, Sidebar Reports

## Prioritized Backlog

### P1 (Next)
- [ ] OTP Email integration (currently returns in JSON) — user opted to skip for local; needs Resend/SendGrid for production
- [ ] Dashboard performance: replace O(N*M) loop in total_profit with `$lookup` pipeline or denormalize cost on invoice items at creation time
- [ ] Analytics page UI (graphs) — backend APIs ready, no frontend page yet
- [ ] Multi-invoice payment allocation UI (currently single reference per payment; backend already supports array)

### P2 (Nice to Have)
- [ ] Aging analysis (30/60/90 days) on customer/supplier profiles
- [ ] Quotation system
- [ ] Export to Excel/PDF (separate from browser print)
- [ ] WhatsApp invoice sharing
- [ ] Order-to-invoice auto-promotion when all items delivered
- [ ] DialogDescription / aria-describedby on all shadcn dialogs (a11y)

## Test Credentials
- Admin: `admin@example.com / admin123`
- File: `/app/memory/test_credentials.md`

## Reports / Artifacts
- `/app/test_reports/iteration_1.json` (MVP)
- `/app/test_reports/iteration_2.json` (Phase 1)
- `/app/test_reports/iteration_3.json` (Phase 2 — 18/18 backend ✅)
- `/app/backend/tests/test_phase2.py` (automated regression suite)

## Phase 3 — Workflow Refinements (April 23, 2026) ✅ COMPLETE

### Invoice System Corrections
- Removed manual invoice creation UI entirely (Invoices tab has no New Invoice button; Dashboard Quick Actions replaced "New Invoice" with "Analytics")
- Invoices are generated ONLY from Orders via `POST /api/invoices/from-order/{order_id}`
- Info banner on Invoices page: "Invoices are generated from Orders"

### Dashboard Quick Action Fixes
- "New Order" → `/orders?new=1` auto-opens Create Order dialog (useSearchParams)
- "Record Payment" → `/payments?new=1` auto-opens Record Payment dialog
- Added "Analytics" quick action linking to new page

### Analytics Page (NEW)
- Route: `/analytics` with sidebar nav item
- Charts (Recharts): Sales Trend (area), Revenue vs Cost (line), Profit Trend (area)
- Period filter buttons: 30 Days / 60 Days / 90 Days / 1 Year
- Summary tiles: Total Sales, Total Profit, Data Points

### Multi-Cheque Payment Entry (CRITICAL)
- Backend: `PaymentCreate.cheques: List[ChequeDetail]` with (amount, bank_name, cheque_number, cheque_date); sum validated to equal payment amount
- Frontend: "Add Cheque" button in payment dialog when method=cheque adds dynamic cheque rows; running total shown vs payment amount (green when matched, amber when mismatched)

### Edit Payment Feature
- `PUT /api/payments/{id}` — accepts partial updates (amount, method, cheques, allocations, notes)
- Validates cheque sum and allocation sum vs new amount
- If amount reduced without resending allocations, rejects if existing allocations exceed new amount
- Recalculates invoice statuses for both old and new allocation targets
- Frontend: Pencil icon per row → opens pre-filled Edit Payment dialog

### Multi-Invoice Allocation UI
- Payment dialog has "Allocate to Invoices/Purchases" section with "+Add Allocation" button
- Each allocation row = SearchableSelect + amount
- Running total vs payment amount shown

### Report Print Fix
- New helper: `/app/frontend/src/lib/printer.js` — `printHtml(title, body)` opens a fresh window with self-contained styled HTML and auto-prints
- Applied to: Customer Outstanding, Global Outstanding, Supplier Payable, Customer Payments, Supplier Payments, Financial Summary
- Print output contains only report tables/totals (no sidebar, no buttons)

### Payment Reports (NEW)
- `GET /api/reports/customer-payments?date_from=&date_to=` — items (id, date, customer_name, amount, method, cheque info, notes), total, count
- `GET /api/reports/supplier-payments?date_from=&date_to=` — same shape for suppliers
- Frontend: Reports tabs with date-range pickers and Generate/Print buttons

### Financial Summary (NEW)
- `GET /api/reports/financial-summary?date_from=&date_to=` — total_sales, total_cost, total_profit, total_purchases, total_supplier_paid, total_payables, invoice_count, customer_count, customers[]
- Frontend: 6 metric cards + customer list; printable

### Bill Numbering Configuration
- `GET /api/settings/counters` → {invoices, purchases, orders}
- `PUT /api/settings/counters/{name}` {value: int} — rejects values below highest existing number to prevent duplicates
- Frontend: Reports → Settings tab with input per counter + Save button; preview of next number (e.g. INV-1051)

### Testing (iteration_4.json)
- Backend: 13/13 pytest cases passed (100%) — test_phase3.py
- Frontend: All Phase 3 flows verified — Dashboard (no New Invoice, quick-action auto-open), Analytics page, multi-cheque UI, edit payment pre-fill, all new report tabs, Settings counter inputs

## Prioritized Backlog (post-Phase 3)

### P1
- Admin role enforcement on `/api/settings/counters/*` (currently any authenticated user)
- Batched $lookup in `financial-summary` and dashboard `total_profit` (avoid O(N*M) product lookups)
- Add `<DialogDescription>` to shadcn DialogContent instances to silence a11y console warnings
- Email OTP integration (Resend/SendGrid) — skipped for local

### P2
- Aging analysis (30/60/90 days) on customer/supplier profiles
- Quotation system
- Export to Excel/PDF (in addition to HTML print)
- WhatsApp invoice sharing
- Auto-promote order → invoice when all items delivered
