# OK Footwear — ERP System Complete Feature List

> Items marked **\[OPTIONAL\]** are recommended but can be deferred to a later implementation phase.

---


OK Footwear


ERP System — Complete Feature List


> 📌 Covering: Order Management • Procurement • Production • Outsourcing


> 📌 Inventory • Finance • HR • Import/Export • Reports & Administration


Bangladesh, 2025


★ Items marked [OPTIONAL] are recommended but can be deferred to a later implementation phase.


---

# 1. Order Management


## 1.1 Buyer & Order Registration

- Maintain a buyer master (Bay, Lotto, Walker, etc.) with contacts, payment terms, and delivery preferences
- Register new orders with order number, buyer name, article/style, size breakdown, quantity, unit price, and delivery date
- Attach buyer-provided tech packs, specifications, and artwork files to each order
- Support multiple order types: bulk production order, sample order, repeat order
- Unique order reference number auto-generated per buyer with sequential tracking

## 1.2 Order Planning & Scheduling

- Auto-generate a production timeline from the order delivery date (backward scheduling)
- Set milestones: raw material booking, production start, QC, packing, and shipment
- View all active orders in a production calendar
- Alert system for orders at risk of missing milestones
- Order capacity check against available factory capacity before acceptance

## 1.3 Sample & Development Tracking

- Create and track pre-production samples: PP sample, counter sample, and size set
- Log buyer comments and revision requests per sample round
- Track sample approval status before bulk production is released
- Sample dispatch register with courier details and delivery confirmation

## 1.4 Order Status & Communication

- Real-time order status dashboard: received → materials booked → in production → QC → packed → delivered
- Generate buyer-facing order confirmation and shipment advice documents
- Delivery challan and packing list generation linked to each order
- Shipment tracking with carrier, vehicle, and delivery confirmation

## 1.5 Buyer Quotation & Price List Management

- Create quotations for prospective and existing buyers before a confirmed order is placed
- Auto-populate quotation cost from BOM and current vendor rates with profit margin overlay
- Version control on quotations: track each revision with date, changed fields, and reason
- Quotation validity period with expiry alerts
- Buyer-specific price lists: maintain agreed rates per article, per size run, and per currency
- Quotation approval workflow before sending to buyer
- One-click conversion of an accepted quotation into a confirmed production order
- Quotation win/loss tracking: record outcome and reason for lost quotations for sales analysis
- Quotation summary report: sent, pending, won, and lost within a date range

## 1.6 Buyer Complaint & Return Management

- Complaint registration linked to the originating order and delivery challan
- Complaint classification: quality defect, wrong style, wrong size, short shipment, packaging issue
- Photo and document attachment support per complaint
- Root cause analysis entry per complaint with responsible section
- Corrective and Preventive Action (CAPA) tracking with owner, due date, and closure status
- Return goods receipt: receive returned pairs, inspect, and decide on rework, scrap, or re-shipment
- Credit note or replacement order generation linked to complaint
- Complaint ageing report: open complaints by buyer, order, and days outstanding
- Repeat complaint analysis: identify recurring defect types and responsible production sections

---

# 2. Procurement Management


## 2.1 Vendor & Supplier Management

- Vendor master with name, type (fabric, sole, tag, box, sticker, accessories), contact, bank details, and credit terms
- Vendor performance scoring: on-time delivery rate, quality rejection rate
- Approved vendor list per material category
- Blacklist/hold status for non-performing vendors with audit trail

## 2.2 Purchase Requisition & Order

- Auto-generate purchase requisitions from Bill of Materials (BOM) when an order is confirmed
- Multi-level purchase order approval workflow: store → manager → MD
- PO management with item details, quantity, rate, delivery date, and vendor
- PO amendment and cancellation tracking with version history
- Consolidated purchasing: merge requisitions from multiple orders into a single PO

## 2.3 Open Tender / Competitive Bidding  [OPTIONAL]


> ⚠️ **Note (Optional):** Recommended for high-value purchases (e.g., above BDT 5 lakh), bulk raw material contracts, machinery procurement, or annual packaging supply agreements. Ensures competitive pricing and procurement transparency.

- Tender creation: define scope of supply, item specifications, required quantity, delivery timeline, and evaluation criteria; attach technical specification documents
- Vendor invitation: send tender notices to all approved vendors in the relevant category; option to publish openly or invite a pre-qualified shortlist only
- Bid submission management: receive and register vendor quotations with sealed-bid integrity (bids locked until opening date); support for single-envelope and two-envelope (technical + commercial) systems
- Comparative statement (CS): auto-generate a side-by-side comparison of all received bids across price, delivery lead time, payment terms, and past performance score
- Bid evaluation workflow: multi-member evaluation committee scoring with approval routing to management before award decision
- Tender award & negotiation: award to selected vendor or enter negotiation round; maintain a full audit trail of why each bid was selected or rejected
- Link to Purchase Order: seamlessly convert an awarded tender into a standard PO within the procurement module
- Tender archive: searchable record of all past tenders, outcomes, and historic prices for future benchmarking

## 2.4 Goods Receipt & Quality Inspection

- Goods Receipt Note (GRN) against each PO or awarded tender
- Inward quality inspection: accept, reject, or hold with reason codes
- Partial delivery tracking across multiple GRNs against one PO
- Auto-update inventory on GRN approval
- Rejection report and return-to-vendor (RTV) process with debit note

## 2.5 Vendor Payments & Ledger

- Track outstanding payables per vendor
- Payment scheduling based on credit terms
- Debit notes for rejected or returned materials
- Vendor account statement generation
- Advance payment tracking with adjustment against subsequent invoices

---

# 3. Bill of Materials (BOM) & Costing


## 3.1 BOM Management

- Define BOM per article/style: upper material, lining, sole, insole, thread, adhesive, tags, labels, stickers, boxes, and polybags
- Support size-wise variation in material consumption
- Version control for BOM revisions with change log
- BOM copy and clone for new but similar articles
- BOM approval workflow before it is used in production orders

## 3.2 Cost Sheet

- Auto-generate cost sheet per order from BOM and vendor rates
- Include material cost, trims cost, labour cost, overhead, and profit margin
- Compare estimated vs actual cost per order after completion
- Cost sheet approval workflow before order acceptance
- What-if pricing: simulate how a price change in one material affects total cost

---

# 4. Production Management (Factory)


## 4.1 Production Planning

- Weekly and monthly production planning board
- Allocate orders to production lines/floors based on available capacity
- Track machine availability and downtime
- What-if capacity analysis: if order X is added, when can it be delivered?
- Production plan vs actual tracking with variance reporting

## 4.2 Bill of Operations & Routing

- Define standard operation sequence per article: cutting → stitching → lasting → sole attaching → finishing → QC → packing
- Set standard allowed minute (SAM) per operation for efficiency calculation
- Assign operations to sections and responsible supervisors
- Operation-wise target setting per shift

## 4.3 Daily Production Tracking

- Record daily production output per line, per operation, per worker
- Track WIP (Work in Progress) at each production stage
- Identify bottlenecks through WIP buildup reports
- Record production losses and rejections at each stage with reason codes
- Shift-wise production entry with supervisor sign-off

## 4.4 Quality Control

- In-line QC checkpoints at each production stage
- Final QC before packing: pass, fail, or rework
- Defect register with defect type, quantity, and responsible section
- AQL-based sampling plan for final inspection
- Buyer-specific QC checklist support
- QC report generation for buyer communication

## 4.5 Machine & Equipment Management

- Machine register with type, model, purchase date, and production capacity
- Preventive maintenance schedule and log
- Breakdown and repair log with downtime hours tracked
- Spare parts inventory for machines
- Machine-wise utilization and efficiency report

## 4.6 Scrap & Waste Management

- Scrap recording by type: upper offcuts, rejected soles, damaged insoles, adhesive waste, and packaging waste
- Scrap entry linked to production stage and order where the waste was generated
- Scrap valuation: assign a recoverable value per scrap type for financial reporting
- Approved scrap disposal workflow: record method (sale, recycling, landfill) with authorisation
- Scrap sale register: record buyer, quantity, rate, and revenue from scrap sales
- Waste percentage report per style, per production line, and per period
- Scrap trend analysis: identify styles or operations generating disproportionate waste

## 4.7 Last & Mould Management


> 📌 Shoe lasts and moulds are high-value physical assets unique to footwear manufacturing. Each last or mould is size- and style-specific and must be tracked through its entire lifecycle from procurement to retirement.

- Last and mould register: unique ID, type, style, size, material, supplier, purchase date, and purchase cost
- Assignment to production orders: track which last or mould is in use on which line
- Condition tracking: good, worn, under repair, and retired
- Usage cycle count per last or mould with recommended replacement threshold
- Maintenance and repair log with cost per repair event
- Storage location tracking when not in use
- Retirement and write-off workflow with reason recording
- Last and mould inventory report: available, in use, under repair, and retired counts by style and size

---

# 5. Outsourcing Management


## 5.1 Subcontractor Master

- Register 3rd party factories with capacity, specialization, location, and payment terms
- Track subcontractor performance history: quality, delivery, and compliance
- Subcontractor compliance documents (trade license, factory certification)

## 5.2 Work Order to Subcontractor

- Issue work orders when internal capacity is exceeded, with full order split detail
- Define scope: full pair, upper only, stitching only, lasting only, etc.
- Attach relevant BOM, specifications, and tech pack to work order
- Work order approval workflow before dispatch to subcontractor

## 5.3 Material Issue to Subcontractor

- Issue raw materials to subcontractor from your own stock when buyer-supplied
- Material issue challan with item-wise quantities and signatures
- Track material balance: issued vs consumed vs returned
- Material reconciliation report per subcontractor per work order

## 5.4 Outsourced Production Tracking

- Track production progress at subcontractor level with expected completion dates
- Receive finished goods against work orders with GRN
- Inward inspection of outsourced goods before acceptance into finished goods store
- Shortage and damage claim management for outsourced orders

## 5.5 Subcontractor Billing & Payment

- Receive and verify subcontractor invoices against issued work orders
- Track payables to subcontractors separately from raw material vendors
- Deduction management: material shortage, quality rejection, penalty clauses
- Subcontractor account statement generation

---

# 6. Inventory Management


## 6.1 Multi-Location Warehouse

- Separate stock registers for: raw material store, trims & accessories store, finished goods store, and packing materials store
- Support for multiple physical locations or bins within a warehouse
- Item master with unit of measure, category, HSN/HS code, and reorder parameters

## 6.2 Stock Transactions

- Stock in: GRN, production returns, outsourcing returns, opening stock entry
- Stock out: production issue, sample issue, delivery challan, write-off
- Stock transfer between locations with transfer challan
- Stock adjustment with reason code, approver name, and supporting evidence

## 6.3 Inventory Controls & Alerts

- Define reorder level, minimum stock, and maximum stock per item
- Auto-alert when stock falls below reorder level
- Slow-moving and dead stock reports
- FIFO-based stock valuation for accurate cost reporting
- Batch/lot tracking for raw materials where traceability is needed

## 6.4 Physical Stock Count

- Schedule and conduct physical stock counts by location
- System vs physical count variance report
- Approval workflow for stock adjustments after count
- Cycle count support (count a subset of items on a rolling basis)

---

# 7. Delivery & Dispatch

- Generate delivery challan for every shipment, linked to the originating order
- Vehicle and carrier registration with dispatch log
- Commercial invoice and packing list generation per shipment
- Proof of delivery (POD) recording with date and receiver signature
- Delivery performance report: on time vs delayed, broken down by buyer
- Partial shipment support: track quantities delivered vs total order quantity
- Return goods management: receive and process buyer returns with reason codes

---

# 8. Import / Export Management


## 8.1 Import Module (Machines & Raw Materials)

- Register import LCs (Letter of Credit) and import permits
- Track import shipment stages: order placed → LC opened → shipment → customs clearance → delivery
- Landed cost calculation: product cost + freight + insurance + customs duty + port charges
- Customs duty and HS code management per item
- Document management: bill of lading, commercial invoice, packing list, certificate of origin
- Bank and LC charge tracking with fund allocation
- Import register for machines and capital equipment with asset tagging

## 8.2 Export Module (Finished Shoes)

- Export order registration and LC management for overseas buyers
- Back-to-back LC management where applicable
- Export document generation: commercial invoice, packing list, bill of lading, and certificate of origin
- Export incentive tracking: cash incentive and duty drawback applicable under Bangladesh NBR rules
- Foreign currency receivable tracking and repatriation status
- BGMEA / BFLLFEA reporting support as applicable

## 8.3 Duty Exemption & Bond Management

- Manage bonded warehouse and duty-free import of raw materials used in export production
- Utilization declaration tracking per import lot against export orders
- Bond register and annual utilization summary for customs compliance

---

# 9. Finance & Accounts


## 9.1 General Ledger

- Chart of accounts customized for shoe manufacturing
- Journal entries, adjusting entries, and year-end closing entries
- Trial balance, profit & loss statement, and balance sheet
- Multi-year comparative financial reporting

## 9.2 Accounts Payable

- Vendor invoices linked to POs or tender awards, payment scheduling, and aging report
- Bank payment vouchers and cheque management
- Bank reconciliation statement
- Outstanding payables summary by vendor and by due date

## 9.3 Accounts Receivable

- Buyer invoices linked to delivery challans
- Receipt vouchers against buyer payments
- Aging report for outstanding receivables by buyer
- Overdue payment alerts with days outstanding

## 9.4 Cost Accounting

- Actual cost of production per order compared against estimated cost sheet
- Overhead allocation to production orders
- Profitability report per order, per buyer, and per article
- Cost variance analysis: material, labour, and overhead

## 9.5 Cash & Bank Management

- Petty cash register for factory and office separately
- Multiple bank accounts with transaction register
- Daily cash and bank position report
- Fund transfer between accounts

## 9.6 Taxation

- VAT and tax on purchases and sales as per Bangladesh NBR requirements
- TDS / withholding tax on vendor payments
- Monthly tax summary reports for compliance
- Mushak 6.3 (purchase register) and Mushak 6.2 (sales register) support

## 9.7 Fixed Asset Management


> 📌 Manages all long-term physical assets including factory machinery, production equipment, office furniture, computers, and vehicles. Imported machines from Module 8 are automatically registered here as assets upon customs clearance and delivery.

- Asset register: unique asset ID, name, category, location, department, purchase date, supplier, and original cost
- Auto-registration of imported machines from Module 8 using landed cost as asset value
- Asset tagging and barcode or QR code label generation for physical tracking
- Depreciation method configuration per asset category: straight-line and diminishing balance
- Useful life and salvage value configuration per asset category
- Automated monthly depreciation posting to the general ledger
- Asset revaluation with revaluation reserve tracking
- Asset transfer between departments or locations with approval workflow
- Asset disposal and write-off workflow: sale, scrap, or loss with gain or loss on disposal calculation
- Scheduled and unscheduled maintenance log per asset linked to machine management in section 4.5
- Asset-wise net book value report at any point in time
- Depreciation schedule report: monthly and annual depreciation per asset and per category
- Fixed asset register summary for balance sheet and audit purposes

## 9.8 Budgeting & Planning

- Annual budget preparation by department and cost center
- Budget line items mapped to the chart of accounts for direct comparison
- Budget approval workflow: department head → finance → MD
- Revised budget support: mid-year budget revision with version control and reason log
- Monthly budget vs actual variance report by department, cost center, and GL account
- Variance threshold alerts: flag line items where actual exceeds budget by a defined percentage
- Rolling forecast: update projections based on year-to-date actuals and remaining period estimates
- Capital expenditure (CAPEX) budget tracking separately from operating expenditure (OPEX)
- Budget utilisation report: percentage spent vs budget for each department

## 9.9 Local LC Management


> ⚠️ **Note (Optional):** [OPTIONAL] Applicable when procuring high-value raw materials domestically through local Letters of Credit (local LCs), which are common in the Bangladesh textile and footwear supply chain.

- Local LC creation: link to purchase order, define LC amount, validity, and issuing bank
- LC stage tracking: application → bank issuance → vendor acknowledgement → shipment → document presentation → payment
- Bank charge recording per LC: issuance fee, amendment fee, and acceptance commission
- LC amendment management with version history
- Document checklist per LC: invoice, delivery challan, inspection certificate, and other required documents
- LC utilisation tracking: amount drawn vs total LC value
- Local LC register and outstanding liability report

---

# 10. HR & Payroll


## 10.1 Employee Master

- Separate records for office staff and factory workers
- Employee profiles: personal info, contact details, emergency contacts, and employment details
- Custom fields per employee type: full-time, contractor, intern, and part-time
- Factory worker categories: operator, helper, quality inspector, line supervisor, floor in-charge
- Profile photo upload and avatar management
- Role, department, joining date, salary structure, and NID/documents stored per employee
- Sensitive field encryption at app layer: national ID, passport, and bank account number
- Bulk employee import via CSV with async job processing and error reporting
- Employee self-service profile updates

## 10.2 Employment Lifecycle

- Hire → Transfer → Promotion → Demotion → Exit event tracking
- Append-only employment history log with full audit trail
- Probation period tracking with confirmation date management
- Notice period configuration per employee
- Termination workflow with last working date, exit type, reason recording, and provident fund & gratuity disbursement
- Effective-dated changes: promotions and transfers apply on future dates

## 10.3 Organization Management

- Hierarchical department tree with self-referencing structure and unlimited depth
- Department head assignment
- Cost center and location tagging per department
- Job titles with level classification: junior, mid, senior, and lead
- Pay grades with salary band (min/max) per currency
- Reporting line management: direct line and dotted-line manager
- Headcount tracking per department and location

## 10.4 Org Chart

- Full company org tree with drill-down navigation
- Subtree view rooted at any employee
- Headcount overlays and vacancy indicators

## 10.5 Attendance

- Web-based clock-in / clock-out with IP capture
- Biometric device integration support
- Overtime hour tracking per worker per day with manager approval
- Daily attendance status: present, absent, late, half-day, on leave
- Manual correction by HR with reason and approval
- Monthly attendance summary reports
- Late and missing-punch exception reports

## 10.6 Leave Policies

- Configurable leave types: annual, sick, casual, unpaid, maternity, paternity, comp-off, and bereavement
- Accrual engine: annual, monthly, or no-accrual rules
- Carry-forward limits and year-end lapse policies
- Maximum balance caps per leave type
- Leave encashment configuration
- Document requirement flag per leave type
- Minimum advance notice days enforcement
- Half-day leave support: morning and afternoon session

## 10.7 Holiday Calendars

- Multiple calendars per company, configurable by location or entity
- Holiday types: public, optional, and restricted
- Year-based calendar management

## 10.8 Leave Balances

- Per-employee, per-year balance ledger: opening + accrued + adjusted − used
- Manual HR adjustment with reason and audit trail
- Balance history across years
- Carry-forward computation at year rollover

## 10.9 Leave Requests & Approvals

- Employee self-service: apply, view, and cancel leave requests
- Multi-level approval workflow: employee → manager → HR
- Half-day and hourly leave support
- Backdating controls with override audit
- Team leave calendar with conflict detection
- Bulk approval for managers
- Automated notifications at every workflow step

## 10.10 Shifts & Scheduling

- Shift definition: name, start/end time, break duration, and night-shift flag
- Employee shift assignment with effective date range
- Weekly schedule grid view for managers
- Shift swap requests and approval workflow

## 10.11 Salary Structure

- Flexible salary component builder: earnings, deductions, and benefits
- Component calculation modes: fixed amount, percentage of another component, or formula expression
- Salary structures (component bundles) with sequencing
- Per-employee salary assignment with effective dating and history
- Per-employee component override on a salary record
- Salary revision workflow with manager and HR approval

## 10.12 Payroll Processing

- Monthly, bi-weekly, and weekly pay cycle support
- Async payroll computation engine with pre-run validation checklist
- Loss-of-pay (LOP) calculation from attendance data
- Statutory deductions: income tax, PF, ESI — configurable by jurisdiction
- Component-level payroll entry with override support
- Payroll cycle statuses: draft → processing → approved → disbursed
- Piece-rate wage support for factory operators where applicable
- Salary slip generation in Bangla and English
- Bangladesh labour law compliance: provident fund, gratuity, and festival bonus
- Payroll reversal with reason and audit trail

## 10.13 Payslips

- Branded PDF payslip generation per employee per pay cycle
- Bulk async payslip generation for a full cycle
- Payslip email distribution to all employees
- Employee self-service payslip download for all historical cycles

## 10.14 Bank Disbursement

- Bank transfer file export in ACH, NEFT, or configurable format
- Per-employee primary bank account with encrypted account number
- Disbursement status tracking per entry

## 10.15 Tax Declarations

- Employee tax declaration portal per financial year
- Tax regime selection configurable per jurisdiction
- HR verification and approval of declarations
- Year-end tax form generation: Form 16, W-2, or jurisdiction-configurable

## 10.16 Expense Reimbursement

- Expense category library with per-category amount limits
- Employee claim submission with receipt upload
- Multi-level approval workflow: employee → manager → finance
- Reimbursement merged into payroll cycle or processed as standalone payment
- Expense report by category, department, and employee

## 10.17 Salary Advances

- Employee advance request with reason
- HR approval with configurable recovery months
- Auto-recovery tracking against subsequent payroll runs

## 10.18 Performance & Training

- Worker skill matrix showing who can operate which machine
- Training records and certifications per worker
- Efficiency tracking per worker linked to daily production data
- Promotion and increment history log

## 10.19 Document Vault

- Per-employee document store: offer letters, NDAs, ID proofs, contracts, and certificates
- Document type classification and version tracking
- Expiry date tracking with renewal alerts
- Role-based document access control
- Bulk document download

## 10.20 Policy Management

- Company policy library with version control
- Mandatory read-and-acknowledge workflow with deadline
- Policy change broadcast notifications
- Acknowledgement audit report: who read, when, and which version
- Soft delete with version history preservation

## 10.21 eSign

- Built-in eSign for HR documents
- SHA-256 file hash for tamper-proof signed document archive
- DocuSign and Adobe Sign integration hooks
- Sign request expiry management

## 10.22 GDPR & Data Privacy

- Data export on employee request
- Role-based data visibility controls
- Retention policy configuration
- Right-to-erasure workflow

## 10.23 Provident Fund Management


> 📌 Applicable to companies that operate a Provident Fund scheme under the Bangladesh Labour Act 2006. Manages both employee and employer contributions, fund balances, interest accrual, and full or partial settlement on exit.

- PF scheme configuration: employee contribution %, employer contribution %, and effective date
- Eligibility rules: minimum service period, and employee grade or type inclusion and exclusion
- Monthly PF deduction auto-calculated from payroll run and posted to PF ledger
- Employer contribution auto-calculation and posting per pay cycle
- Per-employee PF ledger: opening balance, monthly credits (employee + employer), interest credited, withdrawals, and closing balance
- Annual interest rate configuration and interest accrual calculation
- PF fund bank account management for companies maintaining their own trust fund
- Partial withdrawal request: employee applies via ESS, HR approves, finance disburses
- Full settlement on exit: auto-calculate final PF balance including pro-rata interest, linked to termination workflow
- PF statement generation per employee for monthly and annual periods
- PF contribution summary report for all employees per pay cycle
- Annual PF return report as required under Bangladesh Labour Act

## 10.24 Gratuity Management


> 📌 Applicable to companies providing gratuity under the Bangladesh Labour Act 2006. Default formula: 30 days' basic wage per completed year of continuous service, with a minimum eligibility of 1 year. Supports enhanced schemes above the statutory minimum.

- Gratuity scheme configuration: formula selection, minimum eligibility tenure, and configurable multiplier for enhanced schemes above statutory minimum
- Per-employee gratuity eligibility status and years-of-service counter updated continuously
- Monthly gratuity liability accrual: system provisions the growing liability so Finance can reflect it accurately in the balance sheet
- Gratuity calculation on exit: auto-compute final entitlement based on last drawn basic salary and completed years of service including proportionate months
- Support for enhanced gratuity schemes: configurable multiplier for companies offering above the statutory 30-days-per-year minimum
- Gratuity fund bank account management for companies maintaining a separate gratuity fund
- Gratuity payment linked to the termination and exit workflow in section 10.2 for seamless settlement
- Per-employee gratuity ledger: accrued amount over service period vs amount paid on exit
- Gratuity provision report: total outstanding liability across all active employees for Finance and audit purposes
- Gratuity settlement report for all exits within a specified date range

---

# 11. Employee Self-Service & Manager Self-Service Portal


## 11.1 Employee Self-Service (ESS)

- View and update personal profile: contact details, address, and emergency contacts
- Update bank account details with automatic HR approval trigger
- View employment history, letter of appointment, and salary structure with component breakdown
- View payslips and download PDF for all historical pay cycles
- View leave balances per leave type and apply for leave
- Track leave request status in real time with approval stage visibility
- Submit attendance correction requests for wrong punches or missed clock-ins
- View personal attendance records and daily punch history
- View team leave calendar to check colleague availability before applying
- Submit expense claims with receipt upload and track reimbursement status
- Request salary advance with reason and track recovery schedule
- Submit resignation and track exit clearance status through all departments
- Acknowledge policy documents and view acknowledgement history
- eSign pending HR documents directly from the portal
- Download HR letters: experience letter, salary certificate, and employment proof
- View and acknowledge upcoming holiday calendar
- Access onboarding task checklist with completion tracking
- View training assignments, course catalog, and personal completion history
- Benefits enrollment portal for eligible schemes
- View company announcements and notice board

## 11.2 Manager Self-Service (MSS)

- Team leave calendar with pending approval queue highlighted
- Approve or reject leave requests, attendance corrections, and overtime requests
- Bulk attendance correction approval for the team
- Approve or reject expense claims and salary advance requests
- View team attendance exceptions, late arrivals, and monthly summaries
- Team headcount and employee profile quick-access
- View team skill matrix and identify training gaps
- Monitor training assignment completion status for the team
- Assign onboarding tasks to new joiners joining under the manager
- Initiate promotion, transfer, demotion, or salary revision requests for team members
- Approve exit clearance for leaving employees in own department
- View team expense summary and claim approval queue
- View team payroll headcount cost in aggregate (not individual payslips)
- Performance review submission and goal tracking per team member

## 11.3 Notifications & Workflow Engine

- In-app notification inbox with unread badge count
- Email notifications with customizable templates per event type
- Push notifications for mobile app users
- SMS notifications for critical events such as salary disbursement and approval requests
- Per-user notification preference settings: opt in or out per event type
- Configurable escalation rules for approvals that breach defined SLA time limits
- Workflow SLA tracking: flag and report approvals that are overdue
- Approval delegation: auto-reassign to a backup approver when primary approver is on leave
- Full audit log of all notifications sent: recipient, event type, channel, and timestamp

---

# 12. Reports & Analytics


## 12.1 Order-Level Reports

- Order status summary: all active orders with milestone completion percentage
- Order profitability report: estimated vs actual margin per order
- Delivery performance by buyer: on-time rate and delay analysis
- Order book summary: value of orders in pipeline by month

## 12.2 Production Reports

- Daily and weekly production output by line and by article
- Efficiency report: actual output vs target (SAM-based)
- Rejection and rework rate by style and by section
- Machine utilization report
- WIP status report across all production stages

## 12.3 Procurement & Inventory Reports

- Purchase order status: open, partially received, and fully received
- Tender comparison and award history report
- Stock aging report by item and category
- Vendor performance report by on-time delivery and rejection rate
- Low stock alert report and reorder recommendations

## 12.4 Financial Reports

- Monthly profit & loss statement
- Cash flow statement
- Outstanding payables and receivables aging
- Cost per pair by article and by buyer
- Import and export ledger summary

## 12.5 HR Reports

- Headcount by department, location, employment type, and status
- Monthly attrition rate report
- Payroll summary per cycle: gross pay, deductions, and net pay
- Leave utilization report by leave type, department, and employee
- Attendance summary per month: present days, late arrivals, absences, and loss-of-pay
- New hire report for a specified date range
- Employee exit report for a specified date range

## 12.6 Management Dashboard

- Key metrics at a glance: active orders, production output today, materials at risk, receivables outstanding
- Alerts for overdue deliveries, low stock, and pending approvals
- Visual charts: monthly shipment trend, buyer-wise order volume, cost vs revenue
- HR snapshot: headcount, open positions, and this month's attrition

## 12.7 Report Delivery

- Report export to Excel (.xlsx) and PDF formats
- Scheduled report delivery via email: daily, weekly, and monthly cadence
- Date-range and department filters available on all reports

---

# 13. System Administration


## 13.1 User Management & Access Control

- User roles and permissions: factory supervisor, procurement officer, accounts, MD, and admin — each seeing only relevant modules
- Role-based menu and field-level access control
- Audit trail for all critical data changes: who changed what, and when
- Data backup and recovery with scheduled automated backups
- Multi-device access: desktop for office, tablet for factory floor use
- API integration support for future connection to banking, courier, or compliance systems

## 13.2 Compliance & License Tracking


> 📌 Centralised register for all regulatory licenses, certifications, and compliance documents required to operate a garment or footwear factory in Bangladesh and to engage in export trade.

- License and certificate register: factory operating license, fire safety certificate, environment clearance, BGMEA membership, IRC (Import Registration Certificate), ERC (Export Registration Certificate), and trade license
- ISO and buyer certification tracking: ISO 9001, social compliance audits (BSCI, SMETA, SA8000), and buyer-specific factory approvals
- Expiry date tracking with configurable advance renewal alerts (e.g., 90, 60, and 30 days before expiry)
- Document attachment per license or certificate with version control
- Renewal workflow: assign responsible person, set renewal deadline, and track completion
- Labour inspection and audit record log with findings and corrective actions
- Compliance calendar view: all upcoming renewals and audit dates in one place
- Compliance status dashboard: green (valid), amber (expiring soon), and red (expired)

## 13.3 Internal Audit Management


> ⚠️ **Note (Optional):** [OPTIONAL] Recommended as the company grows and formalises internal controls across procurement, finance, and HR.

- Annual internal audit plan with scope, department, auditor assignment, and scheduled dates
- Audit checklist templates per module: procurement, finance, inventory, HR, and production
- Finding log: observation, risk rating (high, medium, low), and recommended corrective action
- Corrective action assignment with responsible owner and due date
- Follow-up tracking: open, in progress, and closed findings
- Audit closure report with summary of findings and resolution status
- Repeat finding detection: flag issues that recur across consecutive audit cycles

## 13.4 System Security

- Two-factor authentication (2FA) support for all user logins via OTP to registered mobile or email
- Single sign-on (SSO) support for enterprise environments using SAML or OAuth 2.0
- Session timeout controls with configurable inactivity period per role
- Login attempt monitoring: lock account after defined number of failed attempts with alert to admin
- IP whitelisting for factory terminals and sensitive administrative functions
- Password policy enforcement: minimum length, complexity, and expiry rotation
- Data encryption at rest and in transit (TLS 1.2 or higher)
- Security event log: all login attempts, role changes, and data export events with timestamp and IP address

---

# 14. Board & Corporate Governance Management


> 📌 Dedicated module for OK Footwear as a limited company under the Bangladesh Companies Act 1994. Manages the full lifecycle of board governance: director register, shareholding, board and AGM meetings, resolutions, dividends, statutory compliance, and RJSC filing obligations.


## 14.1 Board Member Register

- Director master record: full name, father's name, NID or passport number, nationality, date of birth, present and permanent address, and contact details
- Director designation classification: Chairman, Managing Director, Executive Director, Independent Director, Nominee Director, and Non-Executive Director
- Director Identification Number (DIN) and date of registration with RJSC
- Appointment date, tenure duration, and confirmation of re-appointment history
- Qualification share requirement tracking per director as per Articles of Association
- Director status: active, resigned, removed, or deceased — with effective date and reason
- Resignation and removal workflow with board approval and RJSC notification trigger
- Disqualification flag: record any court order or regulatory disqualification with details
- Per-director document store: appointment letter, NID/passport copy, consent to act as director (Form IX), photograph, and educational certificates
- Document expiry alerts for passports and other time-bound documents
- Director contact book: email, phone, and preferred communication channel for meeting notices

## 14.2 Shareholding & Share Register

- Share capital configuration: authorised capital, paid-up capital, par value per share, and share classes (ordinary and preference)
- Register of Members (Form I): shareholder name, address, NID or registration number, number of shares held, and date of acquisition
- Share allotment register: record each allotment round with date, allottee, number of shares, consideration paid, and board resolution reference
- Share transfer register: transferor, transferee, number of shares, transfer date, consideration, and approval status
- Share transfer approval workflow with board or committee sign-off before registration
- Share certificate generation: unique certificate number, shareholder name, number of shares, issue date, and authorised signatories
- Real-time shareholding percentage calculation per shareholder and per director
- Shareholding summary table: name, shares held, percentage, and value at par and at paid-up rate
- Share pledge or lien recording against a shareholder's holding
- Beneficial ownership tracking: nominee shareholders with underlying beneficial owner details
- Shareholder communication register: notices, dividend letters, and AGM invitations sent
- Share capital history: full audit trail of all allotments, transfers, buy-backs, and cancellations since incorporation

## 14.3 Board Meeting Management

- Board meeting scheduling: date, time, venue or video conferencing link, and meeting type (regular, special, circular)
- Meeting notice generation with configurable advance notice period as per Articles of Association
- Agenda builder: add agenda items with supporting documents, responsible presenter, and time allocation
- Agenda circulation to all directors with read-receipt tracking
- Attendance register: mark each director as present in person, present via video, or absent with leave of absence
- Quorum validation: system checks minimum quorum as defined in Articles of Association before marking meeting as valid
- Meeting minutes capture: structured recording of discussions, decisions, and voting outcomes per agenda item
- Action item register: task description, assigned director or officer, due date, and closure status
- Follow-up tracking: open action items from previous meetings surfaced automatically in next meeting agenda
- Board meeting calendar: annual calendar view of all scheduled and completed meetings
- Meeting pack generation: compile notice, agenda, supporting papers, and previous minutes into a single PDF for circulation
- Director attendance summary report: meetings attended vs total meetings per director per year

## 14.4 AGM & EGM Management

- AGM scheduling with automatic due-date calculation based on financial year end (must be held within 18 months of incorporation and within 15 months of last AGM per Companies Act 1994)
- EGM (Extraordinary General Meeting) scheduling for special resolutions or urgent matters
- AGM notice generation: send to all shareholders with statutory minimum notice period (14 days for AGM under the Act)
- Agenda preparation: standard AGM agenda items (adoption of accounts, re-appointment of directors, appointment of auditors, declaration of dividend)
- Proxy form generation and proxy registration: record proxy holder, number of shares represented, and authority date
- Attendance and quorum register at AGM: shareholders present in person and by proxy, with total shares represented
- Voting management: show of hands or poll voting; record votes for and against per resolution
- Special resolution threshold tracking: flag if 75% majority required items are correctly voted
- AGM minutes recording with resolution text, voting outcome, and declared results
- Post-AGM action list: dividend payment trigger, auditor appointment notification, RJSC filing trigger
- AGM compliance calendar: upcoming AGM due date with advance alerts at 90, 60, and 30 days

## 14.5 Resolution & Minutes Management

- Resolution register: unique resolution number, meeting reference, date, type (ordinary or special), full resolution text, and voting outcome
- Circular resolution support: pass board resolutions by circulation without a formal meeting, with each director's written consent recorded
- Resolution categorisation: financial approval, appointment, policy change, contract authorisation, regulatory filing, and other
- Digital sign-off on approved minutes: MD, Chairman, and Company Secretary acknowledgement with timestamp
- eSign integration for minutes finalisation (linked to HR module eSign in section 10.21)
- Resolution search and filter: search by keyword, date range, meeting type, or resolution category
- Resolution archive: complete historical register from incorporation, immutable once approved
- Certified copy generation: produce certified true copies of resolutions for bank submissions, regulatory filings, or contract purposes

## 14.6 Dividend Management

- Dividend declaration workflow: finance team proposes → board approves at board meeting → shareholders ratify at AGM (for final dividend)
- Interim and final dividend support with separate declaration cycles
- Dividend rate configuration: per share amount or percentage of paid-up value
- Auto-calculation of dividend entitlement per shareholder based on shares held on record date
- Record date and payment date management
- Dividend warrant or bank transfer generation per shareholder
- Withholding tax on dividend deduction as per Bangladesh NBR rules (currently 10% for resident shareholders)
- Dividend payment register: shareholder name, shares, gross dividend, tax deducted, net paid, and payment date
- Unclaimed dividend register: track unpaid dividends with follow-up reminders
- Dividend history per shareholder across all years
- Dividend payout summary report for board and audit purposes

## 14.7 Committee Management

- Committee register: define committees with name, purpose, terms of reference, and member composition (e.g., Audit Committee, Executive Committee, Remuneration Committee)
- Committee member assignment from the board director list with role (Chairman, Member, Observer) and tenure
- Committee meeting scheduling, notice, and agenda management (same workflow as section 14.3 but scoped to committee)
- Committee meeting minutes and resolution recording
- Committee-specific action item tracking
- Committee report generation: activity summary for presentation to the full board
- Committee charter document storage with version control

## 14.8 Statutory Compliance & RJSC Filing


> 📌 Tracks all statutory filing obligations of OK Footwear as a limited company under the Bangladesh Companies Act 1994, administered by the Registrar of Joint Stock Companies and Firms (RJSC).

- Statutory filing calendar: all annual and event-driven RJSC filing deadlines in one place with advance alerts
- Annual return filing tracker (Schedule X): due date, filing status, acknowledgement number, and filed document archive
- Form XII tracking: notice of change in directors or registered office — triggered automatically when a director appointment or resignation is recorded in section 14.1
- Audited financial statements submission tracking: linked to Finance module annual close
- Statutory registers maintenance checklist: Register of Members, Register of Directors, Register of Mortgages and Charges, Minutes Books
- Charge and mortgage register: record any charge on company assets with charge holder, amount, date of creation, and satisfaction date
- Company secretary assignment and contact details
- Registered office address management with change history
- Certificate of Incorporation and other RJSC certificates stored in the document vault
- Penalty and late filing risk alerts: flag filings approaching deadline without a submitted status

## 14.9 Director Remuneration & Expenses

- Director fee configuration: annual retainer, meeting sitting allowance, and committee allowance per director category
- Sitting allowance auto-calculation based on board and committee meeting attendance records in sections 14.3 and 14.7
- Director expense claim submission and approval workflow (linked to HR Expense Reimbursement in section 10.16)
- Director remuneration approval by the board or remuneration committee as required by Articles of Association
- Remuneration disclosure register: total remuneration per director per year for statutory disclosure
- Tax treatment of director fees: withholding tax deduction and remittance tracking per Bangladesh NBR rules
- Annual director remuneration summary for financial statement disclosure and AGM presentation

## 14.10 Related Party Transactions

- Related party register: identify all related parties — directors, their family members, and entities in which directors hold a material interest
- Transaction disclosure log: record each transaction between the company and a related party with nature, value, terms, and business justification
- Conflict of interest declaration: directors declare interests in contracts or proposed transactions before board approval
- Interested director abstention tracking: record which directors abstained from voting due to a declared conflict
- Board approval workflow for related party transactions above a defined threshold
- Annual related party transaction summary for financial statement disclosure (as required under IAS 24 and Bangladesh reporting standards)
- Alert trigger: flag any procurement, sales, or HR transaction in other ERP modules where the counterparty is a registered related party

## 14.11 Board Document Vault

- Centralised repository for all foundational and ongoing corporate documents
- Document categories: Memorandum of Association (MOA), Articles of Association (AOA), Certificate of Incorporation, Certificate of Commencement of Business, Trade License, TIN Certificate, VAT Registration
- Board and AGM minutes archive: all meeting minutes from incorporation, immutable once approved and signed
- Resolution copies with certified-true-copy generation capability
- RJSC filed documents archive: annual returns, Form XII submissions, and acknowledgement receipts
- Version control on MOA and AOA: track all amendments with special resolution reference and RJSC approval date
- Role-based access control: restrict sensitive documents to board members and authorised officers only
- Document expiry and renewal alerts: trade license, VAT registration, and other time-bound certificates
- Secure sharing: generate time-limited, access-logged share links for sending documents to banks, auditors, or regulators
- Bulk download of all board documents for audit preparation or due diligence

---

# 15. Recommended Implementation Phases


## 15.1 Phase 1 — Core Operations (Months 1–4)

- Order Management
- Procurement (including standard PO; defer Open Tender to Phase 2)
- Inventory Management
- Basic Finance: payables, receivables, cash & bank
- Delivery & Dispatch

## 15.2 Phase 2 — Factory & Extended Office (Months 5–8)

- Production Management & QC
- BOM & Costing
- Outsourcing Management
- HR & Payroll (core: employee master, attendance, payroll)
- Open Tender / Competitive Bidding module [OPTIONAL]

## 15.3 Phase 3 — Advanced & Export-Ready (Months 9–12)

- Import / Export Management
- Duty Exemption & Bond Management
- Fixed Asset Management
- Budgeting & Planning
- Advanced Cost Accounting
- Compliance & License Tracking
- Board & Corporate Governance Management (Module 14)
- HR advanced modules: ESS/MSS portal, document vault, eSign, PF & Gratuity, GDPR
- Management Dashboard & Analytics
- Biometric and third-party API integrations
- Optional modules: Open Tender, Local LC Management, Internal Audit Management