# OK Footwear — ERP Business Requirements Document (BRD)

> Items marked **\[OPTIONAL\]** are recommended but can be deferred to a later implementation phase.

---


OK FOOTWEAR


Enterprise Resource Planning System


Business Requirements Document (BRD)


---

# Document Control


## Version History


## Document Reviewers


---

# 1. Introduction


## 1.1 Purpose of This Document


This Business Requirements Document (BRD) defines the complete set of business requirements for the design, development, and implementation of an Enterprise Resource Planning (ERP) system for OK Footwear Limited. It articulates what the business needs the system to do — not how the system will be built technically — and serves as the primary reference for all subsequent design, development, testing, and acceptance activities.


The BRD is based on extensive analysis of OK Footwear’s current operations, growth plans, regulatory obligations, and the detailed feature list compiled collaboratively by the management team.


## 1.2 Document Scope


This document covers requirements for all 15 modules of the OK Footwear ERP system:

- Order Management
- Procurement Management
- Bill of Materials & Costing
- Production Management
- Outsourcing Management
- Inventory Management
- Delivery & Dispatch
- Import / Export Management
- Finance & Accounts
- HR & Payroll
- Employee & Manager Self-Service Portal
- Reports & Analytics
- System Administration
- Board & Corporate Governance
- Implementation Phases

## 1.3 Intended Audience


## 1.4 Document Conventions

- SHALL — mandatory requirement that must be implemented
- SHOULD — strongly recommended requirement; deviation requires written justification
- MAY — optional requirement; included based on implementation phase and budget
- [OPTIONAL] — feature recommended but deferrable to a later implementation phase
- Requirement IDs follow the format: REQ-[MODULE]-[NNN] (e.g., REQ-ORD-001)

---

# 2. Business Background


## 2.1 Company Overview


## 2.2 Current Business Operations


OK Footwear operates as a vertically integrated shoe manufacturer with the following core workflows:

- Buyer orders are received from established clients such as Bay, Lotto, and Walker, specifying article, style, size run, quantity, unit price, and delivery deadline.
- On order confirmation, raw materials (uppers, soles, lining, adhesives, threads) and accessories (tags, labels, stickers, boxes, polybags) are procured from local vendors.
- Production is carried out in the company’s own factory. When capacity is exceeded, orders or sub-processes are outsourced to approved 3rd party factories.
- Finished goods are quality-inspected, packed, and delivered to buyers with supporting commercial documents.
- The company imports production machinery and spare parts from overseas. Export of finished shoes is in the growth plan.
- As a limited company, OK Footwear has a board of directors with defined shareholding, holds AGMs, and has statutory RJSC filing obligations.

## 2.3 Current State Challenges & Pain Points


## 2.4 Business Drivers for ERP Investment

- Revenue growth: increasing order volumes require structured planning and execution systems
- Export expansion: entering export markets requires compliance documentation, LC management, and real-time cost control
- Quality & compliance: buyer audits and regulatory requirements demand traceability and documented QC processes
- Corporate governance: as a limited company with multiple shareholders, structured board and AGM management is legally required
- Financial control: accurate, real-time cost tracking is essential for profitability management and investor reporting
- Labour law compliance: Bangladesh Labour Act obligations for payroll, provident fund, gratuity, and attendance records carry legal risk if managed manually

---

# 3. Project Overview


## 3.1 Project Name & Description


## 3.2 Project Objectives


The ERP system SHALL achieve the following primary objectives:

- Digitise and integrate all core business operations across factory floor and corporate office into a single platform
- Provide real-time visibility of order status, production progress, inventory levels, and financial performance
- Eliminate manual, Excel-based processes and the associated risk of errors, data loss, and version conflicts
- Enforce business rules, approval workflows, and access controls across all operational areas
- Ensure full compliance with Bangladesh Labour Act 1994, Bangladesh Companies Act 1994, and NBR tax regulations
- Enable export readiness through LC management, duty exemption tracking, and export documentation
- Support board governance through director management, AGM administration, and RJSC filing compliance
- Deliver a management dashboard providing actionable insights for the board and senior management

## 3.3 Expected Business Benefits


## 3.4 Success Criteria & Key Performance Indicators


---

# 4. Project Scope


## 4.1 In Scope


The following 14 functional modules and 1 administration section are in scope for the ERP system:


## 4.2 Out of Scope


The following are explicitly excluded from this ERP implementation:

- E-commerce or direct-to-consumer online sales platform
- Customer-facing buyer portal (buyers will interact through the company’s normal communication channels)
- Advanced manufacturing execution system (MES) with IoT sensor integration
- Product lifecycle management (PLM) for advanced design and development
- Standalone warehouse management system (WMS) with robotics or conveyor integration
- Third-party marketplace integration (Alibaba, Amazon, etc.)
- AI-based demand forecasting (may be considered in a future phase)
- BSEC compliance reporting (not applicable unless company lists publicly)

## 4.3 Implementation Phases


---

# 5. Stakeholders


## 5.1 Internal Stakeholders


## 5.2 External Stakeholders


---

# 6. Business Requirements


## 6.1 Order Management


Key Business Requirements:

- REQ-ORD-001: The system SHALL maintain a buyer master and allow orders to be registered with all commercial terms.
- REQ-ORD-002: The system SHALL auto-generate a backward production schedule from the order delivery date.
- REQ-ORD-003: The system SHALL track sample rounds and prevent bulk production release without sample approval.
- REQ-ORD-004: The system SHALL support buyer quotation creation, version tracking, and conversion to confirmed orders.
- REQ-ORD-005: The system SHALL register buyer complaints, track corrective actions, and manage return goods.
- REQ-ORD-006: The system SHALL provide real-time order status visible to management at all times.

## 6.2 Procurement Management


Key Business Requirements:

- REQ-PRO-001: The system SHALL maintain an approved vendor list per material category.
- REQ-PRO-002: The system SHALL auto-generate purchase requisitions from confirmed order BOMs.
- REQ-PRO-003: The system SHALL enforce a multi-level PO approval workflow before vendor dispatch.
- REQ-PRO-004: The system SHOULD support open tender / competitive bidding for purchases above a defined threshold [OPTIONAL].
- REQ-PRO-005: The system SHALL record GRNs with quality inspection outcome linked to each PO.
- REQ-PRO-006: The system SHALL track outstanding vendor payables and generate payment schedules.

## 6.3 Bill of Materials & Costing


Key Business Requirements:

- REQ-BOM-001: The system SHALL define a BOM per article with version control and approval workflow.
- REQ-BOM-002: The system SHALL auto-generate a cost sheet from the BOM and current vendor rates.
- REQ-BOM-003: The system SHALL compare estimated vs actual cost per order after completion.
- REQ-BOM-004: The system SHALL support what-if pricing simulation for buyer negotiations.

## 6.4 Production Management


Key Business Requirements:

- REQ-PRD-001: The system SHALL maintain weekly and monthly production plans with capacity allocation.
- REQ-PRD-002: The system SHALL record daily production output per line and per operation.
- REQ-PRD-003: The system SHALL enforce in-line and final QC checkpoints with defect recording.
- REQ-PRD-004: The system SHALL track WIP at every production stage.
- REQ-PRD-005: The system SHALL register and track all shoe lasts and moulds by style and size.
- REQ-PRD-006: The system SHALL record scrap by type and stage with disposal authorisation workflow.

## 6.5 Outsourcing Management


Key Business Requirements:

- REQ-OUT-001: The system SHALL issue formal work orders to approved subcontractors linked to production orders.
- REQ-OUT-002: The system SHALL track materials issued to and returned from each subcontractor.
- REQ-OUT-003: The system SHALL record received finished goods with quality inspection before acceptance.
- REQ-OUT-004: The system SHALL reconcile subcontractor invoices against issued work orders.

## 6.6 Inventory & Delivery Management


Key Business Requirements:

- REQ-INV-001: The system SHALL maintain real-time stock balances per item per warehouse location.
- REQ-INV-002: The system SHALL alert when stock falls below the configured reorder level.
- REQ-INV-003: The system SHALL support scheduled physical stock counts with variance reporting.
- REQ-DEL-001: The system SHALL generate delivery challans, packing lists, and commercial invoices linked to orders.
- REQ-DEL-002: The system SHALL record proof of delivery and manage buyer return goods.

## 6.7 Import / Export Management


Key Business Requirements:

- REQ-IMP-001: The system SHALL track import LCs through all stages from opening to payment.
- REQ-IMP-002: The system SHALL calculate landed cost per import shipment including all charges.
- REQ-IMP-003: The system SHALL auto-register imported machinery as fixed assets at landed cost.
- REQ-EXP-001: The system SHALL generate all required export documents (invoice, packing list, B/L, COO).
- REQ-EXP-002: The system SHALL track export incentive entitlements and repatriation status.
- REQ-EXP-003: The system SHALL manage duty-free import utilisation declarations against export orders.

## 6.8 Finance & Accounts


Key Business Requirements:

- REQ-FIN-001: The system SHALL maintain a full double-entry general ledger integrated with all operational modules.
- REQ-FIN-002: The system SHALL generate Mushak 6.2 and 6.3 registers automatically from transactions.
- REQ-FIN-003: The system SHALL maintain a fixed asset register with automated depreciation posting.
- REQ-FIN-004: The system SHALL support annual budget preparation with monthly budget vs actual reporting.
- REQ-FIN-005: The system SHALL produce P&L, balance sheet, and cash flow statements at any time.
- REQ-FIN-006: The system SHALL track order-level profitability comparing actual to estimated cost.

## 6.9 HR & Payroll


Key Business Requirements:

- REQ-HR-001: The system SHALL maintain a complete employee master for both office and factory staff.
- REQ-HR-002: The system SHALL record daily attendance and calculate overtime, LOP, and late deductions automatically.
- REQ-HR-003: The system SHALL process monthly payroll with statutory deductions and produce payslips in Bangla and English.
- REQ-HR-004: The system SHALL manage provident fund contributions, interest accrual, and exit settlements.
- REQ-HR-005: The system SHALL compute and accrue gratuity liability per employee per Bangladesh Labour Act formula.
- REQ-HR-006: The system SHALL provide an employee self-service portal for leave, payslips, and expense claims.
- REQ-HR-007: The system SHALL support eSign for HR documents with tamper-proof archiving.

## 6.10 Board & Corporate Governance


Key Business Requirements:

- REQ-BOD-001: The system SHALL maintain a digital register of all directors with DIN, tenure, and compliance documents.
- REQ-BOD-002: The system SHALL maintain the Register of Members with real-time shareholding percentages.
- REQ-BOD-003: The system SHALL manage board and AGM meetings including notice, agenda, quorum, minutes, and resolutions.
- REQ-BOD-004: The system SHALL calculate dividend entitlements per shareholder with withholding tax deduction.
- REQ-BOD-005: The system SHALL track all RJSC filing deadlines and trigger advance alerts automatically.
- REQ-BOD-006: The system SHALL maintain an immutable resolution archive with certified copy generation.
- REQ-BOD-007: The system SHALL flag related party transactions and enforce conflict of interest declarations.

---

# 7. Non-Functional Requirements


## 7.1 Performance


## 7.2 Security & Data Privacy

- All data transmitted between client and server SHALL be encrypted using TLS 1.2 or higher.
- All sensitive fields (NID, passport, bank account numbers) SHALL be encrypted at the application layer.
- The system SHALL enforce role-based access control (RBAC) at module, screen, and field level.
- Two-factor authentication (2FA) SHALL be supported for all user logins.
- The system SHALL maintain a complete audit trail of all data creation, modification, and deletion events.
- The system SHALL support configurable session timeout and account lockout after failed login attempts.
- The system SHALL comply with GDPR-aligned data privacy principles including data export and right-to-erasure workflows.
- Security event logs SHALL be retained for a minimum of 2 years.

## 7.3 Scalability

- The system architecture SHALL support scaling to 200 concurrent users without re-architecture.
- The system SHALL support unlimited employee records as the workforce grows.
- The database SHALL be designed to retain a minimum of 10 years of transactional history without performance degradation.
- The system SHALL support addition of new modules or third-party integrations via an API layer.

## 7.4 Availability & Reliability


## 7.5 Usability & Accessibility

- The system SHALL support both English and Bangla languages for all user-facing screens and documents.
- The system SHALL be responsive and usable on desktop browsers, tablets, and mobile devices.
- Factory floor data entry screens SHALL be simplified for tablet use by operators with limited IT literacy.
- Payslips and HR documents SHALL be generated in both Bangla and English as configured per employee.
- The system SHALL provide contextual help text and tooltips for all key data entry fields.
- The onboarding experience SHALL include guided setup wizards for initial configuration.

## 7.6 Integration Requirements


## 7.7 Data Migration

- The system SHALL provide a structured data migration plan and tooling to import opening balances, employee records, vendor masters, buyer masters, and asset registers from existing spreadsheets.
- Data migration SHALL include a validation and reconciliation step before go-live cut-over.
- Historical transaction data MAY be migported in summary form (e.g., opening balances for GL accounts) rather than line-by-line.
- A parallel-run period of a minimum of 1 payroll cycle SHALL be conducted before the legacy payroll system is decommissioned.
- All migrated data SHALL be reviewed and signed off by department heads before go-live.

## 7.8 Regulatory & Legal Compliance


---

# 8. Assumptions


The following assumptions have been made in preparing this BRD. If any assumption proves incorrect, the scope, timeline, or budget may need to be revised.

- A reliable internet connection (minimum 10 Mbps broadband) will be available at both the factory and office locations for a cloud-hosted deployment.
- OK Footwear will designate a Project Manager and module-level business owners from within the organisation to participate actively in requirements validation, UAT, and go-live.
- Existing data (employee records, vendor masters, buyer masters, opening stock, and chart of accounts) will be provided in a structured format (Excel) for migration.
- The ERP will be a cloud-based or hosted solution; on-premise deployment is not preferred but may be evaluated.
- All users will have access to a PC, laptop, or tablet with a modern web browser.
- The organisation will invest in user training as part of the implementation and allocate sufficient time for staff participation.
- The board of OK Footwear will formally approve the BRD before development or procurement begins.
- Bangladesh Labour Act rules, NBR tax rates, and RJSC filing requirements in effect as of the date of this document will apply; the system vendor will be responsible for updates if regulations change.
- Biometric attendance devices will be procured separately and integrated in Phase 2; manual web-based clock-in will be used in Phase 1.
- The Company Secretary will own and manage the Board & Governance module with IT administrator support.

---

# 9. Constraints

- Budget: The total implementation budget is to be approved by the board; the phased delivery model is designed to manage cost exposure.
- Timeline: Phase 1 must be live within 4 months of project kick-off; production operations cannot be disrupted during the transition.
- Language: All documents generated by the system (payslips, challans, invoices) must support both Bangla and English output.
- Regulatory: The system must be configurable to reflect Bangladesh-specific tax rates, labour law rules, and RJSC form formats without custom code changes for each regulatory update.
- Connectivity: Factory floor terminals may have intermittent connectivity; the system must gracefully handle offline scenarios or provide a lightweight offline data entry mode.
- Data privacy: Employee NID, passport, and bank account data must never be exposed in plain text in any report, export, or log file.
- Integration: The salary disbursement file format must match the specific bank format used by OK Footwear’s primary payroll bank.
- Change management: The organisation has limited prior ERP experience; the system interface must be intuitive, and the implementation partner must provide comprehensive training.

---

# 10. Dependencies


---

# 11. Risks & Mitigations


---

# 12. Glossary


---

# 13. Approval & Sign-Off


> 📌 Document prepared by the OK Footwear Management Team, May 2025.


> 📌 For queries regarding this document, contact the Managing Director, OK Footwear Limited.
