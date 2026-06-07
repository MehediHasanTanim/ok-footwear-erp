# OK Footwear — Software Requirements Specification (SRS)

> Items marked **\[OPTIONAL\]** are recommended but can be deferred to a later implementation phase.

---


OK FOOTWEAR LIMITED


Software Requirements Specification


ERP System — All Modules


---

# Document Control


## Version History


## Priority & Verification Legend


---

# 1. Introduction


## 1.1 Purpose


This Software Requirements Specification (SRS) defines the complete functional and non-functional requirements for the OK Footwear ERP system. It is the primary technical reference for the implementation partner’s design, development, and testing activities. Every requirement is uniquely identified, prioritised, and assigned a verification method to enable traceability from requirement through to test and acceptance.


This document is intended to be a living specification: approved changes must be tracked through the version control table in the Document Control section.


## 1.2 Intended Audience


## 1.3 System Scope


The OK Footwear ERP system is a multi-module, web-based enterprise application covering the complete operational lifecycle of a shoe manufacturing company: from buyer order receipt through raw material procurement, factory production, outsourcing, inventory management, delivery, import/export, finance, HR & payroll, employee self-service, corporate reporting, system administration, and board governance.


The system will serve approximately 50 concurrent users across two locations (factory and corporate office) and must support bilingual operation in English and Bangla.


## 1.4 Definitions, Acronyms, and Abbreviations


## 1.5 References

- OK-ERP-BRD-2025-001: OK Footwear ERP Business Requirements Document, May 2025
- OK-ERP-FEAT-2025-001: OK Footwear ERP Feature List (complete), May 2025
- IEEE Std 830-1998: IEEE Recommended Practice for Software Requirements Specifications
- Bangladesh Labour Act 2006 (as amended 2013)
- Bangladesh Companies Act 1994
- National Board of Revenue (NBR) VAT Act — Value Added Tax and Supplementary Duty Act 2012
- Bangladesh Bank Foreign Exchange Guidelines
- IAS 16 — Property, Plant and Equipment (IFRS Foundation)
- IAS 24 — Related Party Disclosures (IFRS Foundation)

---

# 2. Overall Description


## 2.1 Product Perspective


The OK Footwear ERP system is a new, purpose-built application with no predecessor system. It replaces a collection of manual processes, paper registers, and standalone Excel workbooks that currently support day-to-day operations. The system will be the single system of record for all operational, financial, and HR data across both the factory and the corporate office.


The system will integrate with the following external components: biometric attendance devices (Phase 2), bank salary disbursement systems, email (SMTP) and SMS gateways, and optionally DocuSign/Adobe Sign for electronic signatures.


## 2.2 Product Functions — High-Level Summary


## 2.3 User Classes and Characteristics


## 2.4 Operating Environment

- OE-01: The system SHALL be deployed as a cloud-hosted web application accessible via modern browsers (Chrome 110+, Firefox 110+, Edge 110+, Safari 16+) without requiring any local installation.
- OE-02: The system SHALL be fully functional on desktop and laptop computers with a minimum screen resolution of 1280 × 768 pixels.
- OE-03: Factory floor data entry screens SHALL be responsive and touch-friendly on 10-inch tablets.
- OE-04: The ESS mobile portal SHALL function on Android 10+ and iOS 15+ mobile browsers.
- OE-05: The system SHALL remain operational with internet speeds as low as 5 Mbps per active user.
- OE-06: The server infrastructure SHALL be hosted in a data centre with ISO 27001 certification.
- OE-07: The system SHALL support a minimum of 50 concurrent users in Phase 1, scalable to 200 in Phase 3.

## 2.5 Design and Implementation Constraints

- C-01: All user-facing text, generated documents (payslips, challans, board notices), and report labels SHALL support both English and Bangla language rendering.
- C-02: The system SHALL use a relational database management system (RDBMS) supporting ACID transactions.
- C-03: All REST API endpoints SHALL require authenticated, role-authorised access. No public endpoints shall expose business data.
- C-04: The system SHALL not store plain-text passwords. All passwords SHALL be hashed using bcrypt or Argon2.
- C-05: Financial computations (payroll, costing, depreciation) SHALL use fixed-point decimal arithmetic to avoid floating-point rounding errors.
- C-06: The salary disbursement file format SHALL be configurable to match the primary payroll bank’s specification without code changes.
- C-07: All generated PDF documents SHALL be produced server-side and must be identical across all browsers and devices.
- C-08: The system SHALL be deployable independently per module phase without requiring a full cutover.

## 2.6 Assumptions and Dependencies

- A-01: A stable internet connection (≥10 Mbps) will be available at both the factory and office locations.
- A-02: OK Footwear will provide all master data (employees, vendors, buyers, assets, chart of accounts) in agreed CSV templates before each phase go-live.
- A-03: Biometric attendance devices will be procured by OK Footwear and will expose a standard SDK or REST API for integration.
- A-04: The implementation partner will keep Bangladesh Labour Act, NBR tax rates, and RJSC form formats up to date within 30 days of any official regulatory change.
- A-05: The primary payroll bank will provide its ACH/NEFT file specification in writing before Phase 1 payroll go-live.
- A-06: DocuSign or Adobe Sign accounts will be provisioned by OK Footwear before Phase 3 eSign features are activated.
- A-07: SMS gateway credentials will be provided before Phase 1 notification features are enabled.

---

# 3. Functional Requirements


## 3.1 Order Management (M01)


Manages the complete order lifecycle from buyer quotation and order registration through production scheduling, sample tracking, delivery, and buyer complaint resolution.


User Roles: Sales/Order Manager, Managing Director, Factory Manager, Dispatch Officer.


Business Rules — Order Management:


## 3.2 Procurement Management (M02)


Covers vendor management, purchase requisition and order workflow, open tender for high-value purchases, goods receipt, quality inspection, and vendor payments.


User Roles: Procurement Manager, Store Officer, Finance Officer, Managing Director.


Business Rules — Procurement:


## 3.3 Bill of Materials & Costing (M03)


Manages per-article BOMs with version control and generates estimated and actual cost sheets per order.


User Roles: Production Manager, Procurement Manager, Finance Officer.


## 3.4 Production Management (M04)


Covers factory production planning, operation routing, daily output tracking, in-line and final QC, machine management, scrap management, and last/mould management.


User Roles: Factory Manager, Production Supervisor, QC Inspector, Line Supervisor.


Business Rules — Production:


## 3.5 Outsourcing Management (M05)


Manages work orders to 3rd party subcontractors, material issue and reconciliation, production receipt, and billing.


User Roles: Factory Manager, Store Officer, Procurement Manager, Finance Officer.


## 3.6 Inventory Management (M06)


Multi-location stock management with real-time balances, FIFO valuation, reorder alerts, and cycle counting.


User Roles: Store Officer, Warehouse Manager, Procurement Manager, Finance Officer.


## 3.7 Delivery & Dispatch (M07)


Covers shipment documentation, dispatch tracking, proof of delivery, and buyer return management.


User Roles: Dispatch Officer, Store Officer, Finance Officer.


## 3.8 Import / Export Management (M08)


Covers import LC management, landed cost computation, export documentation, duty exemption/bond management, and export incentives.


User Roles: Import/Export Manager, Finance Officer, Managing Director.


## 3.9 Finance & Accounts (M09)


Covers general ledger, accounts payable, accounts receivable, cost accounting, cash and bank management, taxation, fixed asset management, budgeting, and local LC management.


User Roles: Finance Manager, Accounts Officer, Managing Director.


Validation Rules — Finance:

- VR-FIN-01: All GL journal entries SHALL be balanced (total debits = total credits) before posting; the system SHALL reject unbalanced entries.
- VR-FIN-02: GL periods SHALL be lockable by the Finance Manager; entries into a locked period SHALL require Finance Manager override with reason.
- VR-FIN-03: Financial computations (payroll, depreciation, interest) SHALL use fixed-point decimal arithmetic to avoid rounding errors.
- VR-FIN-04: Bank reconciliation items SHALL be matched by transaction date range and amount; unmatched items SHALL be flagged.
- VR-FIN-05: Depreciation rate per category SHALL be configurable; the system SHALL not allow a rate that results in net book value below BDT 0.

## 3.10 HR & Payroll (M10)


Covers employee master, employment lifecycle, organisation management, attendance, leave, payroll, salary structure, payslips, bank disbursement, tax declarations, expense reimbursement, salary advances, PF, gratuity, document vault, policy management, eSign, and GDPR compliance.


User Roles: HR Manager, HR Officer, Factory Attendance Officer, Finance Manager.


Business Rules — HR & Payroll:


## 3.11 Employee & Manager Self-Service Portal (M11)


Provides employees and managers with self-service access to HR functions, approvals, and notifications without HR officer intervention for routine actions.


User Roles: All Employees (ESS), All Managers (MSS).


## 3.12 Reports & Analytics (M12)


Delivers operational, financial, and HR reports with date-range filters, scheduled email delivery, and export capabilities.


User Roles: All authenticated users (scoped by role).


## 3.13 System Administration (M13)


Covers user and role management, compliance and license tracking, internal audit management, and system security controls.


User Roles: IT Administrator, Managing Director.


## 3.14 Board & Corporate Governance (M14)


Manages director register, share register, board and AGM meetings, resolutions, dividend management, committee management, RJSC statutory compliance, director remuneration, related party transactions, and the board document vault.


User Roles: Company Secretary, Managing Director, Finance Officer.


Business Rules — Board Governance:


---

# 4. External Interface Requirements


## 4.1 User Interface Requirements

- UI-01: The system SHALL implement a consistent design system with a unified colour palette, typography, and component library across all modules.
- UI-02: All data entry forms SHALL display inline field-level validation errors in real time without requiring a full page reload.
- UI-03: The system SHALL support keyboard navigation for all primary workflows to enable power-user efficiency.
- UI-04: Factory floor screens (production entry, attendance clock-in) SHALL use large touch targets (≥48 × 48 px) optimised for tablet use.
- UI-05: All tables and lists SHALL support column sorting, search/filter, and pagination with configurable page size.
- UI-06: PDF documents generated by the system SHALL match the company’s approved letterhead template.
- UI-07: The system SHALL display all monetary values with the configured currency symbol and two decimal places consistently.
- UI-08: All date fields SHALL accept and display dates in both English (DD/MM/YYYY) and Bangla calendar formats.
- UI-09: Loading indicators SHALL be displayed for any operation taking more than 500 milliseconds.
- UI-10: The system SHALL display a confirmation dialog for all irreversible actions (deletion, approval, payroll posting).

## 4.2 Hardware Interfaces


## 4.3 Software Interfaces


## 4.4 Communication Interfaces

- CI-01: All client-server communication SHALL use HTTPS with TLS 1.2 or higher; HTTP SHALL be redirected to HTTPS.
- CI-02: All REST API responses SHALL use JSON format with consistent error envelope: { status, code, message, data }.
- CI-03: API authentication SHALL use JWT (JSON Web Token) with a configurable expiry of 8 hours for standard sessions.
- CI-04: Webhook payloads (from biometric devices, DocuSign) SHALL be verified using HMAC-SHA256 signature validation.
- CI-05: The system SHALL implement API rate limiting to prevent abuse: maximum 100 requests per minute per user token.
- CI-06: Large file uploads (documents, receipts) SHALL use multi-part form data with a maximum file size of 10 MB per file.

---

# 5. Non-Functional Requirements


## 5.1 Performance Requirements


## 5.2 Security Requirements


## 5.3 Scalability Requirements

- NFR-SC01: The database schema and application architecture SHALL support horizontal scaling (adding server nodes) without application code changes.
- NFR-SC02: The system SHALL support growing from 50 to 200 concurrent users by adding compute resources without re-architecture.
- NFR-SC03: The system SHALL retain a minimum of 10 years of transactional data without performance degradation.
- NFR-SC04: The system SHALL support adding new modules or third-party integrations via a documented REST API without modifying core business logic.
- NFR-SC05: Async job queues (payroll, PDF generation, bulk import) SHALL be independently scalable from the main application tier.

## 5.4 Availability & Reliability Requirements


## 5.5 Usability Requirements

- NFR-U01: New users SHALL be able to complete a standard data entry task (register an order, raise a PO) after a maximum of 2 hours of role-specific training.
- NFR-U02: All system error messages SHALL be written in plain language (English and Bangla) and SHALL include the action the user should take to resolve the error.
- NFR-U03: The system SHALL auto-save form data every 60 seconds to prevent data loss on browser crash or accidental navigation.
- NFR-U04: All mandatory fields SHALL be clearly marked with a visual indicator before form submission.
- NFR-U05: The system SHALL provide role-specific onboarding checklists for first-time users of each module.
- NFR-U06: Factory floor screens SHALL achieve a task-completion success rate of ≥90% in usability testing with low-literacy tablet users.

## 5.6 Maintainability Requirements

- NFR-M01: The application codebase SHALL adhere to a documented coding standard, and all business logic SHALL have a minimum of 80% unit test coverage.
- NFR-M02: Tax rates, statutory percentages (PF rate, gratuity formula, dividend withholding tax), and regulatory form formats SHALL be configurable via an admin interface without code deployment.
- NFR-M03: A full system upgrade (bug fix or minor feature) SHALL be deployable with zero downtime using a rolling or blue-green deployment strategy.
- NFR-M04: The system SHALL include structured application logging (error, warning, info) with log retention of minimum 90 days.
- NFR-M05: Database schema migrations SHALL be version-controlled and executable in sequence without data loss.

---

# 6. Data Requirements


## 6.1 Key Entity Overview


6.1.1  Order


6.1.2  Purchase Order


6.1.3  Employee


6.1.4  Payroll Run


6.1.5  Fixed Asset


6.1.6  Director


## 6.2 Data Integrity Rules

- DIR-01: Foreign key relationships SHALL be enforced at the database level; orphaned records are not permitted.
- DIR-02: All monetary amounts SHALL be stored as DECIMAL with a minimum of 4 decimal places to preserve precision.
- DIR-03: All timestamps SHALL be stored in UTC and converted to the user’s configured timezone for display.
- DIR-04: Soft delete SHALL be used for all master data (vendors, employees, articles); records are marked inactive, not removed.
- DIR-05: Approved financial transactions (posted GL entries, approved payroll, approved GRNs) SHALL be immutable; corrections require reversal entries.
- DIR-06: Employee NID and bank account numbers SHALL never appear in any application log, error message, or API response beyond the originating secure endpoint.
- DIR-07: Share register and director register records SHALL be append-only for audit integrity; no hard-delete is permitted.

## 6.3 Data Retention Policies


---

# 7. Use Cases


## UC-001: Register and Schedule a New Production Order


Main Flow:

- Order Manager navigates to Order Management → New Order.
- System displays the order registration form with buyer dropdown (pre-populated from buyer master).
- Order Manager selects the buyer, enters article/style, size run with quantities per size, unit price, currency, and target delivery date.
- Order Manager attaches the buyer’s tech pack and specification files.
- Order Manager selects Order Type = ‘Bulk Production’ and clicks ‘Save as Draft’.
- System validates all mandatory fields and checks that delivery date is at least 7 days from today.
- Order Manager clicks ‘Confirm Order’; system checks factory capacity against the delivery date.
- If capacity is available: system assigns a unique order number and auto-generates a backward milestone schedule.
- System sends a notification to the Factory Manager: ‘New order [ORDER-NO] confirmed. Review production plan.’
- Factory Manager reviews the order in the production planning board and allocates it to a production line.

Alternative Flows:

- AF-A: If the delivery date is less than 7 days from today, system displays a validation error and prevents confirmation.
- AF-B: If factory capacity is insufficient for the delivery date, system displays a warning (not a block) and prompts the Factory Manager to consider outsourcing.
- AF-C: If no Approved BOM exists for the article, system displays an alert; order can be saved as Draft but cannot be confirmed until BOM is approved.

Postconditions:

- A confirmed order with a unique order number exists in the system with status = Confirmed.
- A backward milestone schedule is visible in the production planning board.
- Factory Manager has been notified.

## UC-002: Process Purchase Requisition to Goods Receipt


Main Flow:

- System auto-generates purchase requisitions from the order BOM with item, required quantity, and required-by date.
- Procurement Manager reviews consolidated requisitions and groups items by vendor.
- Procurement Manager creates a PO for each vendor, enters unit rates, and saves.
- If PO value is above BDT 5,00,000: system routes for MD approval; MD receives notification.
- MD reviews and approves the PO; system generates a PDF PO document.
- Procurement Manager sends PO to vendor (email generated by system).
- On delivery: Store Officer creates a GRN against the PO, enters received quantity and lot/batch reference.
- QC Inspector records inspection outcome (Accept/Reject/Hold) per GRN line.
- Store Officer approves the GRN; system automatically updates inventory stock.
- Finance Officer receives notification of GRN for three-way match before vendor invoice payment.

Alternative Flows:

- AF-A: If received quantity is less than PO quantity, GRN is partially received; PO status = Partially Received; balance remains open.
- AF-B: If QC Inspector marks a GRN line as Rejected: system generates a Return-to-Vendor (RTV) document and debit note; rejected quantity is not added to inventory.
- AF-C: If vendor is not on the approved vendor list: system blocks PO creation and displays an error prompting the Procurement Manager to seek manager override.

Postconditions:

- GRN is approved and inventory stock is updated with the received quantity.
- Finance module has a pending vendor invoice to match.

## UC-003: Monthly Payroll Cycle


Main Flow:

- HR Manager navigates to Payroll → New Payroll Run, selects month and year.
- System runs a pre-run validation checklist: flags missing attendance, unapproved leaves, or employees without salary structure.
- HR Manager resolves flagged issues and clicks ‘Compute Payroll’.
- System asynchronously computes gross pay, LOP deductions, overtime additions, statutory deductions (PF, TDS), and net pay per employee.
- System displays a payroll summary: total gross, total deductions, total net, and count of employees.
- HR Manager reviews the payroll register, makes any permitted manual overrides with justification.
- HR Manager submits for Finance Manager approval.
- Finance Manager reviews and approves; MD receives a notification for final disbursement approval if configured.
- On MD approval: system exports the bank disbursement file in the configured bank format.
- HR Manager marks the payroll cycle as Disbursed; system bulk-generates PDF payslips and sends to all employees by email.
- GL entries are automatically posted: Salary Expense Dr, PF Payable Cr, TDS Payable Cr, Bank Cr.

Alternative Flows:

- AF-A: If an employee’s bank account is not configured: their salary is flagged as ‘Pending Bank Details’; the disbursement file excludes them until resolved.
- AF-B: Payroll reversal: if an error is discovered after disbursement, Finance Manager can initiate a reversal cycle which posts counter GL entries and allows a corrected re-run.

## UC-004: Conduct Board Meeting and Record Resolutions


Main Flow:

- Company Secretary navigates to Board → Board Meetings → Schedule Meeting.
- Enters date, time, venue/video link, and meeting type (Regular/Special).
- Builds the agenda: adds agenda items with supporting document attachments.
- System generates a meeting notice PDF (with agenda and supporting papers) and sends to all directors with read-receipt tracking.
- On meeting day: Company Secretary opens the meeting record and marks each director as Present, Video, or Absent.
- System validates quorum against the configured minimum; warns if quorum is not met.
- Company Secretary records minutes per agenda item: discussion summary, decision, and voting outcome.
- For each resolution: system assigns a resolution number and records votes for, against, and abstentions.
- Company Secretary submits minutes for Chairman digital sign-off.
- Chairman signs via eSign; system archives the signed minutes with SHA-256 hash.
- Company Secretary marks the meeting as Closed; action items are dispatched to responsible officers.

Alternative Flows:

- AF-A: If quorum is not met: Company Secretary records the meeting as ‘Inquorate’; no resolutions can be passed; meeting is adjourned.
- AF-B: Special resolution: if the resolution type is Special and votes for < 75%, system flags it as Failed and records accordingly.

## UC-005: Employee Leave Application and Approval


Main Flow:

- Employee logs into ESS portal and navigates to My Leave → Apply for Leave.
- Employee selects leave type, start date, end date, and enters reason.
- System checks available leave balance; displays remaining balance after the requested period.
- System checks team leave calendar for conflicts (colleagues already on leave during the same period).
- Employee submits; system sends approval notification to Line Manager.
- Line Manager reviews the request in MSS portal, views team leave calendar, and approves or rejects with comment.
- If approved by Manager and HR sign-off is required for the leave type: system routes to HR Officer.
- HR Officer approves; system updates employee leave balance and marks attendance records as On Leave.
- Employee receives a notification: ‘Your leave request for [dates] has been approved.’

Alternative Flows:

- AF-A: Insufficient balance: system displays warning; employee cannot submit without HR override.
- AF-B: Manager rejects with comment: employee receives rejection notification and can re-apply or appeal.
- AF-C: Approval SLA breach: if Manager has not acted within the configured SLA (e.g., 2 working days), system escalates to HR Officer with a breach alert.

## UC-006: Export Shipment Documentation


Main Flow:

- Export Manager navigates to Import/Export → Export Shipment → New Shipment.
- Links the shipment to the export order and export LC.
- Enters shipment details: vessel/flight, port of loading, port of destination, shipping date, carrier name.
- System auto-populates commercial invoice from the order: buyer, article, quantity, unit price, total value.
- Export Manager reviews and confirms the commercial invoice.
- System generates the packing list from the delivery challan.
- Export Manager selects the required certificate of origin type (GSP or standard); system generates the document.
- System bundles all export documents (invoice, packing list, B/L draft, COO) into a single PDF package.
- Export Manager submits documents to the bank for negotiation; records submission date in the system.
- Finance Officer tracks LC utilisation and foreign currency receivable; records repatriation date on receipt.

Postconditions:

- All export documents are stored and version-tracked in the system.
- LC utilisation is updated; foreign currency receivable is recorded in Finance module.

---

# 8. Verification & Acceptance Criteria


## 8.1 Testing Strategy


## 8.2 Go-Live Acceptance Criteria

- AC-01: 100% of Must Have (M) FRs for the relevant phase have a passing test result signed off by the QA lead.
- AC-02: 0 open Critical or High severity defects at go-live; Medium defects have an agreed resolution date within 14 days of go-live.
- AC-03: Performance test results confirm that page load time (NFR-P01) and concurrent user targets (NFR-P05) are met.
- AC-04: Security penetration test report has no unresolved Critical or High findings.
- AC-05: All department owners (Finance, HR, Factory, Board) have completed UAT and signed the UAT sign-off form.
- AC-06: Data migration: migrated opening balances have been reconciled to the source data and signed off by the Finance Manager.
- AC-07: User training has been completed for all go-live user roles with a minimum 80% pass rate on the training assessment.
- AC-08: System uptime during the 2-week parallel-run period is ≥99% (excluding planned maintenance).
- AC-09: Automated backup and recovery procedure has been tested successfully (data restored in < RTO).
- AC-10: The IT Administrator has verified that 2FA is enforced for all production user accounts.

---

# Appendix A: Business Rules Register


This appendix consolidates all business rules defined in Section 3 into a single searchable register.


---

# Appendix B: Requirements Traceability Matrix (RTM)


> 📌 End of Software Requirements Specification — OK Footwear ERP v1.0


> 📌 Document Reference: OK-ERP-SRS-2025-001  |  May 2025  |  CONFIDENTIAL
