# OK Footwear ERP — API Contract Test Cases
**Scope:** Consumer-driven contract tests using Pact. React frontend (consumer) defines the expected API shape; NestJS backend (provider) verifies it on every CI run.

---

## Orders Contracts

### TC-CONT-ORD-001: GET /api/orders/:id — response shape
```typescript
it('orders API returns expected order detail shape', async () => {
  await provider.addInteraction({
    state: 'order ORD-000001 exists',
    uponReceiving: 'a request for order ORD-000001',
    withRequest: { method: 'GET', path: '/api/orders/ORD-000001', headers: { Authorization: like('Bearer token') } },
    willRespondWith: {
      status: 200,
      body: { data: {
        id: like('uuid'), orderNumber: like('ORD-000001'), status: like('draft'),
        buyer: { id: like('uuid'), name: like('Bay Stores'), currency: like('USD') },
        article: { id: like('uuid'), articleCode: like('MEN-CASUAL-001') },
        unitPrice: like(12.50), totalQuantity: like(500),
        orderLines: eachLike({ sizeLabel: like('38'), quantity: like(100) }),
        deliveryDate: like('2026-09-01'),
      }},
    },
  });
  const result = await ordersApi.getById('ORD-000001');
  expect(result.data.orderNumber).toBeDefined();
});
```

### TC-CONT-ORD-002: GET /api/orders — paginated list shape
```typescript
it('orders list returns data array with pagination meta', async () => {
  await provider.addInteraction({
    state: 'multiple orders exist',
    uponReceiving: 'a request for paginated orders list',
    withRequest: { method: 'GET', path: '/api/orders', query: { page: '1', limit: '10' }, headers: { Authorization: like('Bearer token') } },
    willRespondWith: {
      status: 200,
      body: {
        data: eachLike({ id: like('uuid'), orderNumber: like('ORD-000001'), status: like('draft') }),
        meta: { page: like(1), limit: like(10), totalCount: like(42), totalPages: like(5) },
      },
    },
  });
  const result = await ordersApi.list({ page: 1, limit: 10 });
  expect(result.meta.totalCount).toBeDefined();
});
```

### TC-CONT-ORD-003: POST /api/orders — 422 validation error shape
```typescript
it('orders API returns RFC 7807 error on validation failure', async () => {
  await provider.addInteraction({
    state: 'invalid order payload submitted',
    uponReceiving: 'a POST /api/orders with invalid data',
    withRequest: { method: 'POST', path: '/api/orders', headers: { Authorization: like('Bearer token') }, body: { unitPrice: 0 } },
    willRespondWith: {
      status: 422,
      body: {
        type: like('/errors/validation'),
        title: like('Validation failed'),
        errors: eachLike({ field: like('unitPrice'), message: like('Price must be greater than 0') }),
      },
    },
  });
  await expect(ordersApi.create({ unitPrice: 0 })).rejects.toMatchObject({ status: 422 });
});
```

---

## Auth Contracts

### TC-CONT-AUTH-001: POST /api/auth/login — success shape
```typescript
it('login response includes accessToken', async () => {
  await provider.addInteraction({
    state: 'user admin@ok.com exists and is active',
    uponReceiving: 'a valid login request',
    withRequest: { method: 'POST', path: '/api/auth/login', body: { email: 'admin@ok.com', password: 'Secret@123' } },
    willRespondWith: {
      status: 200,
      body: { data: { accessToken: like('eyJ...'), expiresIn: like(28800) } },
    },
  });
  const result = await authApi.login({ email: 'admin@ok.com', password: 'Secret@123' });
  expect(result.data.accessToken).toBeDefined();
});
```

### TC-CONT-AUTH-002: POST /api/auth/login — 401 shape
```typescript
it('login failure returns 401 with RFC 7807 body', async () => {
  await provider.addInteraction({
    state: 'user exists with different password',
    uponReceiving: 'a login request with wrong password',
    withRequest: { method: 'POST', path: '/api/auth/login', body: { email: 'admin@ok.com', password: 'Wrong' } },
    willRespondWith: {
      status: 401,
      body: { type: like('/errors/unauthorized'), title: like('Unauthorized') },
    },
  });
  await expect(authApi.login({ email: 'admin@ok.com', password: 'Wrong' })).rejects.toMatchObject({ status: 401 });
});
```

---

## HR Contracts

### TC-CONT-HR-001: GET /api/employees/:id — employee profile shape
```typescript
it('employee endpoint returns expected profile structure', async () => {
  await provider.addInteraction({
    state: 'employee EMP-000042 exists',
    uponReceiving: 'request for employee profile',
    withRequest: { method: 'GET', path: '/api/employees/EMP-000042', headers: { Authorization: like('Bearer token') } },
    willRespondWith: {
      status: 200,
      body: { data: {
        id: like('uuid'), employeeCode: like('EMP-000042'),
        fullName: like('Karim Ahmed'),
        department: { id: like('uuid'), name: like('Production') },
        designation: like('Floor Supervisor'),
        status: like('active'), basicSalary: like(25000),
        joinDate: like('2022-01-15'),
      }},
    },
  });
  const result = await employeesApi.getById('EMP-000042');
  expect(result.data.employeeCode).toBeDefined();
});
```

### TC-CONT-HR-002: GET /api/payroll/entries/:id/payslip — presigned URL shape
```typescript
it('payslip endpoint returns presigned S3 download URL', async () => {
  await provider.addInteraction({
    state: 'payroll entry PE-001 exists for current user',
    uponReceiving: 'request for payslip download URL',
    withRequest: { method: 'GET', path: '/api/payroll/entries/PE-001/payslip', headers: { Authorization: like('Bearer token') } },
    willRespondWith: {
      status: 200,
      body: { data: { downloadUrl: like('https://s3.amazonaws.com/erp-exports/payslip.pdf?X-Amz-Signature=...'), expiresIn: like(900) } },
    },
  });
  const result = await payrollApi.getPayslipUrl('PE-001');
  expect(result.data.downloadUrl).toContain('https://');
});
```

---

## Inventory Contracts

### TC-CONT-INV-001: GET /api/inventory/stock-summary — summary shape
```typescript
it('stock summary returns total qty and reorder flag', async () => {
  await provider.addInteraction({
    state: 'stock summary exists for item INV-001',
    uponReceiving: 'request for stock summary',
    withRequest: { method: 'GET', path: '/api/inventory/stock-summary/INV-001', headers: { Authorization: like('Bearer token') } },
    willRespondWith: {
      status: 200,
      body: { data: {
        itemId: like('uuid'), itemCode: like('INV-001'),
        totalQty: like(250), avgUnitCost: like(15.50),
        totalValue: like(3875.00), belowReorder: like(false),
      }},
    },
  });
  const result = await inventoryApi.getStockSummary('INV-001');
  expect(typeof result.data.belowReorder).toBe('boolean');
});
```

---

## Notification SSE Contracts

### TC-CONT-SSE-001: SSE stream delivers notification event shape
```typescript
it('SSE notification event has expected structure', async () => {
  const eventSource = new EventSource('/api/notifications/stream', { headers: { Authorization: `Bearer ${token}` } });
  const event = await new Promise<MessageEvent>((resolve) => {
    eventSource.addEventListener('notification', resolve);
  });
  const data = JSON.parse(event.data);
  expect(data).toMatchObject({
    id:           expect.any(String),
    type:         expect.stringMatching(/^(approval_request|alert|info)$/),
    title:        expect.any(String),
    createdAt:    expect.any(String),
    isRead:       expect.any(Boolean),
  });
  eventSource.close();
});
```

---

*Total contract test cases: 10 | Tool: Pact (consumer + provider verification) | Runs on every PR*
