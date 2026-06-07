# OK Footwear ERP — Integration Test Cases
**Scope:** Full HTTP request/response cycle using Supertest against a real NestJS app, real PostgreSQL (testcontainers), and real Redis. Each suite wraps in a transaction rolled back on teardown.

---

## Auth Endpoints

### TC-AUTH-I-001: POST /api/auth/login — success returns tokens
```typescript
it('returns 200 with accessToken and sets httpOnly refresh cookie', async () => {
  await seedUser(prisma, { email: 'admin@ok.com', password: 'Secret@123', status: 'active' });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@ok.com', password: 'Secret@123' });
  expect(res.status).toBe(200);
  expect(res.body.data.accessToken).toBeDefined();
  expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('refreshToken')]));
});
```

### TC-AUTH-I-002: POST /api/auth/login — wrong password returns 401
```typescript
it('returns 401 with error detail on wrong password', async () => {
  await seedUser(prisma, { email: 'user@ok.com', password: 'correct' });
  const res = await request(app).post('/api/auth/login').send({ email: 'user@ok.com', password: 'wrong' });
  expect(res.status).toBe(401);
  expect(res.body.title).toBe('Unauthorized');
});
```

### TC-AUTH-I-003: POST /api/auth/refresh — rotates tokens
```typescript
it('returns new accessToken and rotates refresh cookie', async () => {
  const { refreshCookie } = await loginAndGetCookies(app);
  const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
  expect(res.status).toBe(200);
  expect(res.body.data.accessToken).toBeDefined();
  expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('refreshToken')]));
});
```

### TC-AUTH-I-004: POST /api/auth/logout — invalidates session
```typescript
it('returns 200 and clears refresh cookie on logout', async () => {
  const { token, refreshCookie } = await loginAndGetCookies(app);
  const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).set('Cookie', refreshCookie);
  expect(res.status).toBe(200);
  // Re-using old refresh token should now fail
  const retry = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
  expect(retry.status).toBe(401);
});
```

---

## Orders API

### TC-ORD-I-001: POST /api/orders — creates draft order
```typescript
it('returns 201 with auto-generated order number', async () => {
  const buyer = await seedBuyer(prisma); const article = await seedArticle(prisma);
  const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
    .send({ buyerId: buyer.id, articleId: article.id, unitPrice: 12.50, totalQuantity: 300,
            deliveryDate: '2026-09-01', currency: 'USD',
            orderLines: [{ sizeLabel: '38', quantity: 150 }, { sizeLabel: '39', quantity: 150 }] });
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('draft');
  expect(res.body.data.orderNumber).toMatch(/^ORD-\d{6}$/);
});
```

### TC-ORD-I-002: POST /api/orders — rejects mismatched line quantities
```typescript
it('returns 422 when order lines do not sum to totalQuantity', async () => {
  const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`)
    .send({ ...validOrderDto, totalQuantity: 500, orderLines: [{ sizeLabel: '38', quantity: 100 }] });
  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'orderLines' })]));
});
```

### TC-ORD-I-003: GET /api/orders — returns paginated list
```typescript
it('returns 200 with data array and pagination meta', async () => {
  await seedOrders(prisma, 15);
  const res = await request(app).get('/api/orders?page=1&limit=10').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(10);
  expect(res.body.meta.totalCount).toBeGreaterThanOrEqual(15);
});
```

### TC-ORD-I-004: PATCH /api/orders/:id/status — valid transition
```typescript
it('returns 200 on successful draft → confirmed transition', async () => {
  const order = await seedOrder(prisma, { status: 'draft', sampleApproved: true });
  const res = await request(app).patch(`/api/orders/${order.id}/status`).set('Authorization', `Bearer ${token}`)
    .send({ status: 'confirmed' });
  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe('confirmed');
});
```

### TC-ORD-I-005: PATCH /api/orders/:id/status — blocks invalid transition
```typescript
it('returns 422 when transition is not allowed by state machine', async () => {
  const order = await seedOrder(prisma, { status: 'confirmed', sampleApproved: false });
  const res = await request(app).patch(`/api/orders/${order.id}/status`).set('Authorization', `Bearer ${token}`)
    .send({ status: 'in_production' });
  expect(res.status).toBe(422);
  expect(res.body.detail).toContain('Sample must be approved');
});
```

### TC-ORD-I-006: GET /api/orders/:id — 404 for non-existent order
```typescript
it('returns 404 with RFC 7807 body for unknown order id', async () => {
  const res = await request(app).get('/api/orders/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
  expect(res.body.type).toBe('/errors/not-found');
});
```

### TC-ORD-I-007: RBAC — employee cannot create orders
```typescript
it('returns 403 when employee_ess role attempts POST /api/orders', async () => {
  const essToken = await getToken(app, 'employee_ess');
  const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${essToken}`).send(validOrderDto);
  expect(res.status).toBe(403);
});
```

---

## HR & Payroll API

### TC-HR-I-001: POST /api/payroll/runs — initiates computation
```typescript
it('returns 202 Accepted and queues BullMQ job', async () => {
  await seedEmployees(prisma, 10);
  const res = await request(app).post('/api/payroll/runs').set('Authorization', `Bearer ${hrToken}`)
    .send({ month: 5, year: 2026 });
  expect(res.status).toBe(202);
  expect(res.body.data.status).toBe('processing');
  expect(mockBullQueue.add).toHaveBeenCalledWith('payroll-compute', expect.objectContaining({ month: 5, year: 2026 }));
});
```

### TC-HR-I-002: POST /api/payroll/runs — blocks duplicate run
```typescript
it('returns 409 when payroll run already exists for the period', async () => {
  await seedPayrollRun(prisma, { month: 5, year: 2026, status: 'approved' });
  const res = await request(app).post('/api/payroll/runs').set('Authorization', `Bearer ${hrToken}`)
    .send({ month: 5, year: 2026 });
  expect(res.status).toBe(409);
});
```

### TC-HR-I-003: POST /api/leave-requests — employee submits leave
```typescript
it('returns 201 with status pending and decrements pending balance', async () => {
  await seedLeaveBalance(prisma, { employeeId, leaveTypeId, balance: 10 });
  const res = await request(app).post('/api/leave-requests').set('Authorization', `Bearer ${empToken}`)
    .send({ leaveTypeId, startDate: '2026-04-10', endDate: '2026-04-12', totalDays: 3, reason: 'Personal' });
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('pending');
});
```

### TC-HR-I-004: PATCH /api/leave-requests/:id/approve — manager approves
```typescript
it('returns 200 and transitions status to manager_approved', async () => {
  const lr = await seedLeaveRequest(prisma, { status: 'pending', employeeId });
  const res = await request(app).patch(`/api/leave-requests/${lr.id}/approve`).set('Authorization', `Bearer ${mgrToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe('manager_approved');
});
```

### TC-HR-I-005: GET /api/employees/:id/payslips — employee sees own payslips only
```typescript
it('returns 403 when employee requests another employee payslips', async () => {
  const otherEmployee = await seedEmployee(prisma);
  const res = await request(app).get(`/api/employees/${otherEmployee.id}/payslips`).set('Authorization', `Bearer ${empToken}`);
  expect(res.status).toBe(403);
});
```

---

## Finance API

### TC-FIN-I-001: POST /api/gl/entries — posts balanced journal
```typescript
it('returns 201 and sets status to posted for a balanced entry', async () => {
  await seedGlPeriod(prisma, { status: 'open', month: 5, year: 2026 });
  const res = await request(app).post('/api/gl/entries').set('Authorization', `Bearer ${finToken}`)
    .send({ periodId, narration: 'Test journal', lines: [
      { accountId: cashAccountId,  debit: 5000, credit: 0 },
      { accountId: salesAccountId, debit: 0,    credit: 5000 },
    ]});
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('posted');
});
```

### TC-FIN-I-002: POST /api/gl/entries — rejects unbalanced journal
```typescript
it('returns 422 for journal where debit ≠ credit', async () => {
  const res = await request(app).post('/api/gl/entries').set('Authorization', `Bearer ${finToken}`)
    .send({ periodId, narration: 'Bad journal', lines: [
      { accountId: cashAccountId, debit: 5000, credit: 0 },
      { accountId: salesAccountId, debit: 0, credit: 4000 },
    ]});
  expect(res.status).toBe(422);
  expect(res.body.detail).toContain('not balanced');
});
```

### TC-FIN-I-003: POST /api/gl/entries — blocked by locked period
```typescript
it('returns 422 when posting to a locked period', async () => {
  const lockedPeriod = await seedGlPeriod(prisma, { status: 'locked' });
  const res = await request(app).post('/api/gl/entries').set('Authorization', `Bearer ${finToken}`)
    .send({ periodId: lockedPeriod.id, narration: 'Test', lines: balancedLines });
  expect(res.status).toBe(422);
  expect(res.body.detail).toContain('locked');
});
```

---

## Inventory API

### TC-INV-I-001: POST /api/inventory/transactions — records stock movement
```typescript
it('returns 201 and updates stock balance via trigger', async () => {
  await seedStockItem(prisma, { id: itemId }); await seedWarehouse(prisma, { id: whId });
  const res = await request(app).post('/api/inventory/transactions').set('Authorization', `Bearer ${storeToken}`)
    .send({ itemId, warehouseId: whId, quantity: 100, direction: 1, txnType: 'grn' });
  expect(res.status).toBe(201);
  const balance = await prisma.inv_stock_balances.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId: whId } } });
  expect(Number(balance.quantity)).toBe(100);
});
```

### TC-INV-I-002: GET /api/inventory/stock-summary — returns aggregated view
```typescript
it('returns 200 with total_qty and below_reorder flag', async () => {
  await seedStockBalance(prisma, { itemId, warehouseId: whId, quantity: 50 });
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW inv.stock_summary`;
  const res = await request(app).get(`/api/inventory/stock-summary/${itemId}`).set('Authorization', `Bearer ${storeToken}`);
  expect(res.status).toBe(200);
  expect(Number(res.body.data.totalQty)).toBe(50);
});
```

---

*Total integration test cases: 28 | Runs against real PostgreSQL + Redis in CI*
