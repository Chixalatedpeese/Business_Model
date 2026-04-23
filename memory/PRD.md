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
