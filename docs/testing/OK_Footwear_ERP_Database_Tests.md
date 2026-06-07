# OK Footwear ERP — Database Test Cases
**Scope:** PostgreSQL triggers, stored functions, constraints, materialized views, and partitioned tables. All tests run against a real PostgreSQL 16 instance.

---

## Trigger: `inv.update_stock_balance`

### TC-DB-INV-001: GRN insert increments stock balance
```typescript
it('increases balance by received quantity on GRN transaction', async () => {
  await insert({ direction: 1, quantity: 100, txnType: 'grn' });
  expect(await getBalance()).toBe(100);
});
```

### TC-DB-INV-002: Production issue decrements stock balance
```typescript
it('decreases balance by issued quantity on production_issue', async () => {
  await seedBalance(200);
  await insert({ direction: -1, quantity: 50, txnType: 'production_issue' });
  expect(await getBalance()).toBe(150);
});
```

### TC-DB-INV-003: Multiple transactions accumulate correctly
```typescript
it('accumulates balance across multiple inserts', async () => {
  await insert({ direction: 1, quantity: 100, txnType: 'grn' });
  await insert({ direction: 1, quantity: 50,  txnType: 'grn' });
  await insert({ direction: -1, quantity: 30, txnType: 'production_issue' });
  expect(await getBalance()).toBe(120);
});
```

### TC-DB-INV-004: Balance cannot go negative (CHECK constraint)
```typescript
it('raises check_balance_non_negative error on negative stock', async () => {
  await seedBalance(10);
  await expect(insert({ direction: -1, quantity: 50, txnType: 'production_issue' }))
    .rejects.toThrow(/check_balance_non_negative/);
});
```

### TC-DB-INV-005: Weighted average cost updated on receipt
```typescript
it('recomputes avg_cost as weighted average on each receipt', async () => {
  await insert({ direction: 1, quantity: 100, unitCost: 10.00, txnType: 'grn' });
  await insert({ direction: 1, quantity: 100, unitCost: 20.00, txnType: 'grn' });
  const balance = await getBalance(true);
  expect(Number(balance.avg_cost)).toBe(15.00); // (1000 + 2000) / 200
});
```

### TC-DB-INV-006: Average cost not changed on stock-out
```typescript
it('preserves avg_cost unchanged on production_issue', async () => {
  await insert({ direction: 1, quantity: 100, unitCost: 15.00, txnType: 'grn' });
  await insert({ direction: -1, quantity: 40, txnType: 'production_issue' });
  const balance = await getBalance(true);
  expect(Number(balance.avg_cost)).toBe(15.00);
});
```

---

## Trigger: `fin.check_period_open`

### TC-DB-FIN-001: Posting to open period succeeds
```typescript
it('allows GL line insert when period status is open', async () => {
  const period = await seedGlPeriod({ status: 'open' });
  await expect(insertGlLine({ periodId: period.id })).resolves.not.toThrow();
});
```

### TC-DB-FIN-002: Posting to closed period is blocked
```typescript
it('raises exception when GL period is closed', async () => {
  const period = await seedGlPeriod({ status: 'closed' });
  await expect(insertGlLine({ periodId: period.id })).rejects.toThrow(/locked GL period/);
});
```

### TC-DB-FIN-003: Posting to locked period is blocked
```typescript
it('raises exception when GL period is locked', async () => {
  const period = await seedGlPeriod({ status: 'locked' });
  await expect(insertGlLine({ periodId: period.id })).rejects.toThrow(/locked GL period/);
});
```

---

## Function: `hr.compute_gratuity()`

### TC-DB-HR-001: Six full years
```typescript
it('returns basic × (30/26) × 6 for 6 completed years', async () => {
  const result = await query(`SELECT hr.compute_gratuity($1::uuid, '2026-01-01'::date)`, [empId]);
  expect(Number(result[0].compute_gratuity)).toBeCloseTo(207_692.31, 2);
});
```

### TC-DB-HR-002: Five years and six months rounds up to six
```typescript
it('rounds 5y 6m up to 6 years per Labour Act rule', async () => {
  const result = await query(`SELECT hr.compute_gratuity($1::uuid, '2025-07-01'::date)`, [empId]);
  expect(Number(result[0].compute_gratuity)).toBeCloseTo(207_692.31, 2);
});
```

### TC-DB-HR-003: Five years and five months stays at five
```typescript
it('keeps 5y 5m as 5 years (fractional months < 6 discarded)', async () => {
  const result = await query(`SELECT hr.compute_gratuity($1::uuid, '2025-06-01'::date)`, [empId]);
  expect(Number(result[0].compute_gratuity)).toBeCloseTo(173_076.92, 2);
});
```

### TC-DB-HR-004: Less than one year returns zero
```typescript
it('returns 0 when service is less than one year', async () => {
  const result = await query(`SELECT hr.compute_gratuity($1::uuid, '2025-10-01'::date)`, [empId]);
  expect(Number(result[0].compute_gratuity)).toBe(0);
});
```

---

## Function: `sys.next_doc_number()`

### TC-DB-SYS-001: Returns formatted document number
```typescript
it('returns prefix + zero-padded counter', async () => {
  const result = await query(`SELECT sys.next_doc_number('order')`);
  expect(result[0].next_doc_number).toMatch(/^ORD-\d{6}$/);
});
```

### TC-DB-SYS-002: Increments counter on each call
```typescript
it('increments current_value by 1 on each invocation', async () => {
  const r1 = await query(`SELECT sys.next_doc_number('order')`);
  const r2 = await query(`SELECT sys.next_doc_number('order')`);
  const n1 = parseInt(r1[0].next_doc_number.replace('ORD-', ''));
  const n2 = parseInt(r2[0].next_doc_number.replace('ORD-', ''));
  expect(n2).toBe(n1 + 1);
});
```

### TC-DB-SYS-003: Concurrent calls produce unique numbers
```typescript
it('produces no duplicate numbers under concurrent inserts', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    query(`SELECT sys.next_doc_number('po')`)
  ));
  const numbers = results.map(r => r[0].next_doc_number);
  expect(new Set(numbers).size).toBe(20);
});
```

---

## Constraints

### TC-DB-CON-001: GL line debit and credit cannot both be non-zero
```typescript
it('raises chk_debit_credit violation when both debit and credit are set', async () => {
  await expect(prisma.fin_gl_entry_lines.create({ data: { debit: 500, credit: 500, ...rest } }))
    .rejects.toThrow(/chk_gl_debit_credit/);
});
```

### TC-DB-CON-002: GL line debit and credit cannot both be zero
```typescript
it('raises chk_nonzero violation when both debit and credit are zero', async () => {
  await expect(prisma.fin_gl_entry_lines.create({ data: { debit: 0, credit: 0, ...rest } }))
    .rejects.toThrow(/chk_gl_nonzero/);
});
```

### TC-DB-CON-003: Order line quantities must be positive
```typescript
it('raises check constraint when quantity is zero', async () => {
  await expect(prisma.ord_order_lines.create({ data: { quantity: 0, ...rest } }))
    .rejects.toThrow(/quantity.*check/i);
});
```

### TC-DB-CON-004: Unique size label per order
```typescript
it('raises unique constraint on duplicate size label in same order', async () => {
  await prisma.ord_order_lines.create({ data: { orderId, sizeLabel: '38', quantity: 100 } });
  await expect(prisma.ord_order_lines.create({ data: { orderId, sizeLabel: '38', quantity: 50 } }))
    .rejects.toThrow(/unique/i);
});
```

### TC-DB-CON-005: Employee factory_category required for factory workers
```typescript
it('raises chk_factory_cat when factory employee has null factory_category', async () => {
  await expect(prisma.hr_employees.create({ data: { employeeCategory: 'factory', factoryCategory: null, ...rest } }))
    .rejects.toThrow(/chk_factory_cat/);
});
```

---

## Materialized Views

### TC-DB-MV-001: brd.current_shareholding reflects allotments
```typescript
it('shows correct shares_held after allotment transaction', async () => {
  await seedShareTransaction({ toShareholder: shId, shares: 1000, txnType: 'allotment' });
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW brd.current_shareholding`;
  const result = await prisma.$queryRaw`SELECT shares_held FROM brd.current_shareholding WHERE shareholder_id = ${shId}::uuid`;
  expect(Number(result[0].shares_held)).toBe(1000);
});
```

### TC-DB-MV-002: inv.stock_summary shows below_reorder flag
```typescript
it('sets below_reorder to true when total_qty <= reorder_level', async () => {
  await seedStockItem(prisma, { id: itemId, reorderLevel: 100 });
  await seedStockBalance(prisma, { itemId, warehouseId: whId, quantity: 80 });
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW inv.stock_summary`;
  const row = await prisma.$queryRaw`SELECT below_reorder FROM inv.stock_summary WHERE item_id = ${itemId}::uuid`;
  expect(row[0].below_reorder).toBe(true);
});
```

---

## Partitioned Tables

### TC-DB-PART-001: Inserts land in correct yearly partition
```typescript
it('routes 2025 audit log to the 2025 partition child', async () => {
  await prisma.sys_audit_logs.create({ data: { ...auditData, createdAt: new Date('2025-06-15') } });
  const count = await prisma.$queryRaw`SELECT count(*) FROM sys.audit_logs_2025`;
  expect(Number(count[0].count)).toBeGreaterThan(0);
});
```

### TC-DB-PART-002: Old partition data excluded from current year query
```typescript
it('does not return 2025 rows when filtering for 2026', async () => {
  await prisma.inv_stock_transactions.create({ data: { ...txnData, txnDate: new Date('2025-12-01') } });
  const rows = await prisma.$queryRaw`
    SELECT * FROM inv.stock_transactions WHERE txn_date >= '2026-01-01'
  `;
  const has2025 = rows.some((r: any) => new Date(r.txn_date).getFullYear() === 2025);
  expect(has2025).toBe(false);
});
```

---

*Total database test cases: 26 | Runs against PostgreSQL 16 testcontainer in CI*
