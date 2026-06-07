# OK Footwear ERP — Unit Test Cases
**Scope:** Backend NestJS services, guards, pipes, interceptors, and utility functions.
All dependencies are mocked. No database or network calls.

---

## Module: Authentication (AuthService)

### TC-AUTH-U-001: Generate tokens returns access + refresh token pair
```typescript
it('returns accessToken (8h) and refreshToken (30d) on valid credentials', async () => {
  mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'test@ok.com', status: 'active', passwordHash: await argon2.hash('pass') });
  const result = await service.login({ email: 'test@ok.com', password: 'pass' });
  expect(result.accessToken).toBeDefined();
  expect(result.refreshToken).toBeDefined();
  const decoded = jwt.decode(result.accessToken) as any;
  expect(decoded.exp - decoded.iat).toBe(8 * 3600);
});
```

### TC-AUTH-U-002: Login fails with wrong password
```typescript
it('throws UnauthorizedException on incorrect password', async () => {
  mockUserRepo.findOne.mockResolvedValue({ id: 'u1', passwordHash: await argon2.hash('correct') });
  await expect(service.login({ email: 'test@ok.com', password: 'wrong' }))
    .rejects.toThrow(UnauthorizedException);
});
```

### TC-AUTH-U-003: Account lockout after 5 failed attempts
```typescript
it('sets locked_until when failed_attempts reaches 5', async () => {
  mockUserRepo.findOne.mockResolvedValue({ id: 'u1', failed_attempts: 4, passwordHash: await argon2.hash('correct') });
  await service.login({ email: 'test@ok.com', password: 'wrong' }).catch(() => {});
  expect(mockUserRepo.update).toHaveBeenCalledWith('u1', expect.objectContaining({
    failed_attempts: 5,
    locked_until: expect.any(Date),
  }));
});
```

### TC-AUTH-U-004: Locked account rejected even with correct password
```typescript
it('throws UnauthorizedException when account is locked', async () => {
  const future = new Date(Date.now() + 60_000);
  mockUserRepo.findOne.mockResolvedValue({ id: 'u1', locked_until: future, passwordHash: await argon2.hash('pass') });
  await expect(service.login({ email: 'test@ok.com', password: 'pass' }))
    .rejects.toThrow('Account is locked');
});
```

### TC-AUTH-U-005: TOTP verification passes with valid OTP code
```typescript
it('returns true for valid TOTP token', async () => {
  const secret = authenticator.generateSecret();
  const token = authenticator.generate(secret);
  const result = await service.verifyTotp({ userId: 'u1', token, encryptedSecret: encrypt(secret) });
  expect(result).toBe(true);
});
```

### TC-AUTH-U-006: TOTP verification fails with expired code
```typescript
it('throws UnauthorizedException for expired TOTP token', async () => {
  const secret = authenticator.generateSecret();
  await expect(service.verifyTotp({ userId: 'u1', token: '000000', encryptedSecret: encrypt(secret) }))
    .rejects.toThrow(UnauthorizedException);
});
```

### TC-AUTH-U-007: Permission cache miss falls back to database
```typescript
it('queries database when Redis returns null for permissions', async () => {
  mockRedis.get.mockResolvedValue(null);
  const dbSpy = jest.spyOn(permissionsRepo, 'findByUser').mockResolvedValue(['orders:read']);
  await service.getPermissions('u1');
  expect(dbSpy).toHaveBeenCalledWith('u1');
  expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringContaining('u1'), 300, expect.any(String));
});
```

### TC-AUTH-U-008: Refresh token rotation invalidates old token
```typescript
it('blacklists old refresh token in Redis on rotation', async () => {
  mockRefreshTokenRepo.findOne.mockResolvedValue({ userId: 'u1', tokenHash: 'oldhash', expiresAt: future });
  await service.refreshTokens('valid-refresh-token');
  expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringContaining('blacklist'), expect.any(Number), '1');
});
```

---

## Module: Orders (OrdersService)

### TC-ORD-U-001: Order number is auto-generated in correct format
```typescript
it('assigns order number from document sequence on create', async () => {
  mockDocSeq.next.mockResolvedValue('ORD-000042');
  const order = await service.create(validOrderDto);
  expect(order.orderNumber).toBe('ORD-000042');
});
```

### TC-ORD-U-002: Status machine — valid transition draft → confirmed
```typescript
it('allows transition from draft to confirmed', async () => {
  mockOrderRepo.findOne.mockResolvedValue({ status: 'draft', sampleApproved: true });
  await expect(service.transitionStatus('o1', 'confirmed')).resolves.not.toThrow();
});
```

### TC-ORD-U-003: Status machine — invalid skip transition
```typescript
it('rejects skip transition from draft to in_production', async () => {
  mockOrderRepo.findOne.mockResolvedValue({ status: 'draft', sampleApproved: true });
  await expect(service.transitionStatus('o1', 'in_production'))
    .rejects.toThrow('Invalid status transition: draft → in_production');
});
```

### TC-ORD-U-004: Production blocked when sample not approved
```typescript
it('blocks confirmed → in_production when sample_approved is false', async () => {
  mockOrderRepo.findOne.mockResolvedValue({ status: 'confirmed', sampleApproved: false });
  await expect(service.transitionStatus('o1', 'in_production'))
    .rejects.toThrow('Sample must be approved before production can begin');
});
```

### TC-ORD-U-005: OrderConfirmedEvent fired on confirmation
```typescript
it('emits OrderConfirmedEvent with correct payload on confirmation', async () => {
  mockOrderRepo.findOne.mockResolvedValue({ id: 'o1', status: 'draft', sampleApproved: true, deliveryDate: '2026-09-01' });
  const emitSpy = jest.spyOn(eventEmitter, 'emit');
  await service.transitionStatus('o1', 'confirmed');
  expect(emitSpy).toHaveBeenCalledWith('order.confirmed', expect.objectContaining({ orderId: 'o1' }));
});
```

### TC-ORD-U-006: Milestones auto-generated on order confirmation
```typescript
it('creates 6 milestone records calculated from delivery date', async () => {
  await service.generateMilestones({ orderId: 'o1', deliveryDate: '2026-09-01' });
  expect(mockMilestoneRepo.createMany).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ milestoneType: 'material_booking' }),
      expect.objectContaining({ milestoneType: 'production_start' }),
      expect.objectContaining({ milestoneType: 'shipment' }),
    ])
  );
  const call = mockMilestoneRepo.createMany.mock.calls[0][0];
  expect(call).toHaveLength(6);
});
```

### TC-ORD-U-007: Quotation marks itself lost when competitor wins
```typescript
it('sets status to lost and records outcome_reason', async () => {
  mockQuotationRepo.findOne.mockResolvedValue({ id: 'q1', status: 'sent' });
  await service.closeQuotation('q1', { outcome: 'lost', reason: 'Price too high' });
  expect(mockQuotationRepo.update).toHaveBeenCalledWith('q1',
    expect.objectContaining({ status: 'lost', outcomeReason: 'Price too high' })
  );
});
```

### TC-ORD-U-008: Complaint CAPA action requires future due_date
```typescript
it('rejects CAPA action with past due_date', async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  await expect(service.createCapaAction({ complaintId: 'c1', dueDate: past, description: 'Fix' }))
    .rejects.toThrow('Due date must be in the future');
});
```

---

## Module: Procurement (ProcurementService)

### TC-PRC-U-001: PO total amount computed from line items
```typescript
it('calculates total_amount as sum of (qty × unit_price) across lines', async () => {
  const lines = [
    { quantity: 100, unitPrice: 5.50 },
    { quantity: 200, unitPrice: 3.25 },
  ];
  const total = service.computePoTotal(lines);
  expect(total).toBe(1200.00); // 550 + 650
});
```

### TC-PRC-U-002: PO raised only to approved vendors
```typescript
it('throws if vendor status is not approved', async () => {
  mockVendorRepo.findOne.mockResolvedValue({ id: 'v1', status: 'blacklisted' });
  await expect(service.createPurchaseOrder({ vendorId: 'v1', lines: [] }))
    .rejects.toThrow('Vendor is not on the approved list');
});
```

### TC-PRC-U-003: Three-way match — invoice cannot exceed PO amount
```typescript
it('rejects vendor invoice when amount exceeds matched PO total', async () => {
  mockPoRepo.findOne.mockResolvedValue({ totalAmount: 1000 });
  mockGrnRepo.findByPo.mockResolvedValue([{ acceptedQty: 80, unitCost: 10 }]);
  await expect(service.matchInvoice({ poId: 'p1', invoiceAmount: 1100 }))
    .rejects.toThrow('Invoice amount exceeds three-way match tolerance');
});
```

### TC-PRC-U-004: GRN triggers GrnApprovedEvent
```typescript
it('emits GrnApprovedEvent with item details on GRN approval', async () => {
  mockGrnRepo.findOne.mockResolvedValue({ id: 'g1', status: 'qc_pending', lines: [{ itemId: 'i1', acceptedQty: 50 }] });
  const emitSpy = jest.spyOn(eventEmitter, 'emit');
  await service.approveGrn('g1');
  expect(emitSpy).toHaveBeenCalledWith('grn.approved', expect.objectContaining({ grnId: 'g1' }));
});
```

### TC-PRC-U-005: Rejected GRN qty cannot exceed received qty
```typescript
it('throws when rejected_qty + accepted_qty exceeds received_qty', async () => {
  await expect(service.recordGrnLine({ receivedQty: 100, acceptedQty: 80, rejectedQty: 30 }))
    .rejects.toThrow('accepted + rejected cannot exceed received');
});
```

---

## Module: Manufacturing (ManufacturingService)

### TC-MFG-U-001: BOM version conflict on duplicate article+version
```typescript
it('throws ConflictException if same article+version already exists', async () => {
  mockBomRepo.findOne.mockResolvedValue({ id: 'b1' });
  await expect(service.createBomVersion({ articleId: 'a1', version: '1.0' }))
    .rejects.toThrow(ConflictException);
});
```

### TC-MFG-U-002: Production blocked without approved BOM
```typescript
it('prevents production order creation when no approved BOM exists', async () => {
  mockBomRepo.findApproved.mockResolvedValue(null);
  await expect(service.createProductionOrder({ orderId: 'o1', articleId: 'a1' }))
    .rejects.toThrow('No approved BOM found for this article');
});
```

### TC-MFG-U-003: Daily production efficiency computed correctly
```typescript
it('computes efficiency_pct as (produced / target) × 100', () => {
  const efficiency = service.computeEfficiency({ produced: 390, target: 500 });
  expect(efficiency).toBe(78.00);
});
```

### TC-MFG-U-004: Zero target returns null efficiency
```typescript
it('returns null efficiency when target_qty is zero', () => {
  const efficiency = service.computeEfficiency({ produced: 0, target: 0 });
  expect(efficiency).toBeNull();
});
```

### TC-MFG-U-005: Cost sheet margin calculation
```typescript
it('computes selling_price = total_cost × (1 + margin_pct / 100)', () => {
  const price = service.computeSellingPrice({ totalCost: 10.00, marginPct: 25 });
  expect(price).toBe(12.50);
});
```

### TC-MFG-U-006: Locked daily production cannot be amended
```typescript
it('throws when attempting to update a locked daily production entry', async () => {
  mockDailyProdRepo.findOne.mockResolvedValue({ id: 'dp1', locked: true });
  await expect(service.updateDailyProduction('dp1', { producedQty: 400 }))
    .rejects.toThrow('Entry is locked and cannot be amended');
});
```

---

## Module: Inventory (InventoryService)

### TC-INV-U-001: Stock transaction is always an insert (never update)
```typescript
it('calls create and never update on stock movement', async () => {
  await service.recordMovement({ itemId: 'i1', warehouseId: 'w1', quantity: 50, direction: 1, txnType: 'grn' });
  expect(mockTxnRepo.create).toHaveBeenCalledTimes(1);
  expect(mockTxnRepo.update).not.toHaveBeenCalled();
});
```

### TC-INV-U-002: Reorder alert fired when balance drops below threshold
```typescript
it('emits StockBelowReorderEvent when balance ≤ reorder_level', async () => {
  mockItemRepo.findOne.mockResolvedValue({ id: 'i1', reorderLevel: 100 });
  mockBalanceRepo.findOne.mockResolvedValue({ quantity: 95 });
  const emitSpy = jest.spyOn(eventEmitter, 'emit');
  await service.checkReorderLevel('i1');
  expect(emitSpy).toHaveBeenCalledWith('stock.below_reorder', expect.objectContaining({ itemId: 'i1' }));
});
```

### TC-INV-U-003: No reorder alert when balance is above threshold
```typescript
it('does not emit event when balance is above reorder level', async () => {
  mockItemRepo.findOne.mockResolvedValue({ id: 'i1', reorderLevel: 100 });
  mockBalanceRepo.findOne.mockResolvedValue({ quantity: 250 });
  const emitSpy = jest.spyOn(eventEmitter, 'emit');
  await service.checkReorderLevel('i1');
  expect(emitSpy).not.toHaveBeenCalled();
});
```

### TC-INV-U-004: Stock count variance computed correctly
```typescript
it('computes variance as physical_qty - system_qty', () => {
  const variance = service.computeVariance({ systemQty: 200, physicalQty: 185 });
  expect(variance).toBe(-15); // shortage
});
```

---

## Module: Finance (FinanceService)

### TC-FIN-U-001: GL journal must balance before posting
```typescript
it('throws when total debit does not equal total credit', async () => {
  const lines = [
    { accountId: 'a1', debit: 5000, credit: 0 },
    { accountId: 'a2', debit: 0,    credit: 4500 }, // imbalanced
  ];
  await expect(service.postJournal({ narration: 'Test', lines }))
    .rejects.toThrow('Journal entry is not balanced');
});
```

### TC-FIN-U-002: Balanced journal posts successfully
```typescript
it('posts journal when debit total equals credit total', async () => {
  const lines = [
    { accountId: 'a1', debit: 5000, credit: 0 },
    { accountId: 'a2', debit: 0,    credit: 5000 },
  ];
  await expect(service.postJournal({ periodId: 'p1', narration: 'Test', lines }))
    .resolves.not.toThrow();
});
```

### TC-FIN-U-003: Posting to locked period is blocked
```typescript
it('throws when target GL period is locked', async () => {
  mockPeriodRepo.findOne.mockResolvedValue({ id: 'p1', status: 'locked' });
  await expect(service.postJournal({ periodId: 'p1', narration: 'Test', lines: validLines }))
    .rejects.toThrow('Cannot post to a locked accounting period');
});
```

### TC-FIN-U-004: Straight-line depreciation calculation
```typescript
it('computes monthly straight-line depreciation correctly', () => {
  const monthly = service.computeMonthlyDepreciation({
    originalCost: 120_000,
    salvageValue:  12_000,
    usefulLifeYears: 10,
    method: 'straight_line',
  });
  expect(monthly).toBe(900.00); // (120000 - 12000) / 10 / 12
});
```

### TC-FIN-U-005: Diminishing balance depreciation calculation
```typescript
it('computes monthly diminishing balance depreciation correctly', () => {
  const monthly = service.computeMonthlyDepreciation({
    netBookValue: 80_000,
    annualRate: 0.20,
    method: 'diminishing_balance',
  });
  expect(monthly).toBeCloseTo(1333.33, 2); // 80000 * 0.20 / 12
});
```

### TC-FIN-U-006: Budget variance computed as actual minus budget
```typescript
it('returns negative variance when actual exceeds budget', () => {
  const variance = service.computeBudgetVariance({ budgeted: 50_000, actual: 62_000 });
  expect(variance).toBe(-12_000);
});
```

---

## Module: HR (HRService)

### TC-HR-U-001: LOP deduction proportional to working days
```typescript
it.each([
  [30_000, 26, 2, 2307.69],
  [25_000, 26, 5, 4807.69],
  [20_000, 30, 1,  666.67],
])('basic=%d, workingDays=%d, lopDays=%d → deduction=%d', (basic, working, lop, expected) => {
  const deduction = service.computeLopDeduction({ basicSalary: basic, workingDays: working, lopDays: lop });
  expect(deduction).toBeCloseTo(expected, 2);
});
```

### TC-HR-U-002: PF deduction at configured percentage
```typescript
it('deducts PF at 10% of basic salary', () => {
  expect(service.computePfEmployee({ basicSalary: 30_000, pctRate: 10 })).toBe(3_000);
});
```

### TC-HR-U-003: Festival bonus included only in qualifying months
```typescript
it('includes festival bonus in payroll for Eid month only', async () => {
  mockPolicyRepo.findOne.mockResolvedValue({ festivalMonths: [3, 8] }); // Eid months
  const bonus = await service.computeFestivalBonus({ employeeId: 'e1', month: 3, basicSalary: 20_000 });
  expect(bonus).toBe(20_000); // 100% of basic
});
```

### TC-HR-U-004: No festival bonus in non-qualifying months
```typescript
it('returns zero festival bonus for non-qualifying months', async () => {
  mockPolicyRepo.findOne.mockResolvedValue({ festivalMonths: [3, 8] });
  const bonus = await service.computeFestivalBonus({ employeeId: 'e1', month: 5, basicSalary: 20_000 });
  expect(bonus).toBe(0);
});
```

### TC-HR-U-005: Gratuity — Labour Act formula correctness
```typescript
it.each([
  ['2020-01-01', '2026-01-01', 30_000, 207_692.31], // 6 years
  ['2020-01-01', '2025-07-01', 30_000, 207_692.31], // 5y 6m → rounds to 6
  ['2020-01-01', '2025-06-01', 30_000, 173_076.92], // 5y 5m → stays 5
  ['2025-01-01', '2025-10-01', 30_000,          0], // < 1 year
])('join=%s exit=%s basic=%d → %d', (join, exit, basic, expected) => {
  const result = service.computeGratuity({ joinDate: join, exitDate: exit, basicSalary: basic });
  expect(result).toBeCloseTo(expected, 2);
});
```

### TC-HR-U-006: Leave balance cannot go negative
```typescript
it('throws when leave application exceeds available balance', async () => {
  mockLeaveBalanceRepo.findOne.mockResolvedValue({ balance: 2.5 });
  await expect(service.applyLeave({ employeeId: 'e1', leaveTypeId: 'lt1', totalDays: 5 }))
    .rejects.toThrow('Insufficient leave balance');
});
```

### TC-HR-U-007: Half-day leave deducts 0.5 days
```typescript
it('deducts 0.5 days for half-day leave request', () => {
  const days = service.computeLeaveDays({ startDate: '2026-03-10', endDate: '2026-03-10', halfDay: 'morning' });
  expect(days).toBe(0.5);
});
```

### TC-HR-U-008: Leave conflict detection
```typescript
it('detects overlapping leave requests for same employee', async () => {
  mockLeaveRepo.findOverlapping.mockResolvedValue([{ id: 'lr1' }]);
  await expect(service.applyLeave({ employeeId: 'e1', startDate: '2026-03-10', endDate: '2026-03-12', totalDays: 3 }))
    .rejects.toThrow('Overlapping leave request already exists');
});
```

### TC-HR-U-009: Salary advance recovery spread across months
```typescript
it('computes monthly instalment as amount / recovery_months', () => {
  const instalment = service.computeAdvanceInstalment({ amount: 30_000, recoveryMonths: 3 });
  expect(instalment).toBe(10_000);
});
```

---

## Module: Board (BoardService)

### TC-BRD-U-001: Meeting cannot be finalised if inquorate
```typescript
it('blocks minutes finalisation when attendee count is below quorum', async () => {
  mockMeetingRepo.findOne.mockResolvedValue({ id: 'm1', quorumRequired: 3 });
  mockAttendeeRepo.count.mockResolvedValue(2); // only 2 attended
  await expect(service.finaliseMinutes('m1'))
    .rejects.toThrow('Quorum not met — minutes cannot be finalised');
});
```

### TC-BRD-U-002: SHA-256 hash recorded on resolution signing
```typescript
it('stores SHA-256 hash of signed resolution document', async () => {
  const fakeHash = 'abc123def456';
  mockHashUtil.sha256.mockReturnValue(fakeHash);
  await service.signResolution({ resolutionId: 'r1', documentBuffer: Buffer.from('doc') });
  expect(mockResolutionRepo.update).toHaveBeenCalledWith('r1',
    expect.objectContaining({ sha256Hash: fakeHash, signedAt: expect.any(Date) })
  );
});
```

### TC-BRD-U-003: Dividend WHT deducted correctly
```typescript
it.each([
  [10_000, 10, 1_000, 9_000],
  [25_000, 15, 3_750, 21_250],
])('gross=%d, wht=%d% → tax=%d, net=%d', (gross, whtPct, tax, net) => {
  const result = service.computeDividendPayment({ grossAmount: gross, withholdingTaxPct: whtPct });
  expect(result.taxDeducted).toBe(tax);
  expect(result.netAmount).toBe(net);
});
```

### TC-BRD-U-004: AGM due within 15 months of previous
```typescript
it('flags overdue AGM when more than 15 months since last AGM', () => {
  const lastAgm = new Date('2024-01-01');
  const isOverdue = service.isAgmOverdue({ lastAgmDate: lastAgm, checkDate: new Date('2025-05-01') });
  expect(isOverdue).toBe(true);
});
```

---

## Guards & Pipes

### TC-GUARD-U-001: RbacGuard allows access with matching permission
```typescript
it('returns true when user has the required module:action permission', async () => {
  mockReflector.getAllAndOverride.mockReturnValue({ module: 'orders', action: 'create' });
  mockPermCache.get.mockResolvedValue(['orders:create', 'orders:read']);
  expect(await guard.canActivate(ctx)).toBe(true);
});
```

### TC-GUARD-U-002: RbacGuard blocks access without permission
```typescript
it('throws ForbiddenException when permission is absent', async () => {
  mockReflector.getAllAndOverride.mockReturnValue({ module: 'board', action: 'approve' });
  mockPermCache.get.mockResolvedValue(['orders:read']);
  await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
});
```

### TC-GUARD-U-003: ValidationPipe strips unknown properties
```typescript
it('removes unknown fields not declared in DTO', async () => {
  const dto = await pipe.transform({ name: 'OK', malicious: 'injection' }, { type: 'body', metatype: CreateBuyerDto });
  expect((dto as any).malicious).toBeUndefined();
  expect(dto.name).toBe('OK');
});
```

### TC-GUARD-U-004: ThrottlerGuard blocks after rate limit exceeded
```typescript
it('throws ThrottlerException after configured request limit', async () => {
  mockRedis.incr.mockResolvedValue(101); // over 100 req/min limit
  await expect(throttler.canActivate(ctx)).rejects.toThrow(ThrottlerException);
});
```

---

*Total unit test cases: 42 | Coverage target: ≥85% statements across all services*
