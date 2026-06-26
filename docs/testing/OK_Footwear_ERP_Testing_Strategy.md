# OK Footwear ERP — Testing Strategy
## Full QA Automation (Zero Manual Testing)

---

## 1. Testing Philosophy — The Pyramid

```
           ▲
          /E2E\          ← 10%  Playwright  (critical user journeys)
         /------\
        / Contract\      ← 10%  Pact        (API consumer-driven contracts)
       /------------\
      / Integration  \   ← 30%  Supertest + real DB  (HTTP layer, modules)
     /----------------\
    /    Unit Tests    \  ← 50%  Jest + Vitest  (logic, components, hooks)
   /--------------------\
```

Every layer runs unattended in CI. A failing test in any layer blocks the PR merge. No code ships without 100% of the test suite passing.

---

## 2. Complete Test Toolchain

| Layer | Tool | Scope |
|---|---|---|
| Backend unit | **Jest + ts-jest** | Services, guards, pipes, utilities |
| Backend integration | **Supertest + testcontainers** | Full HTTP cycle against real PostgreSQL + Redis |
| Database | **Jest + Prisma** | Triggers, functions, constraints, migrations |
| Frontend unit | **Vitest + React Testing Library** | Components, hooks, utilities, Zod schemas |
| Frontend visual | **Storybook + Chromatic** | Component visual regression |
| API contracts | **Pact** | Consumer-driven contract between React and NestJS |
| E2E | **Playwright** | Full browser flows, cross-browser |
| Performance | **k6** | Load, stress, spike testing on critical APIs |
| Security | **OWASP ZAP + custom Jest suites** | Auth, RBAC, injection, CORS |
| Mutation | **Stryker** | Verifies test quality (kills mutants) |
| Coverage | **Istanbul (backend) + v8 (frontend)** | Enforced thresholds in CI |

---

## 3. Backend Testing

### 3.1 Unit Tests — Services

Every service method gets a unit test with all dependencies mocked using Jest's `jest.fn()` / `jest.spyOn()`. No real database, no real Redis.

**PayrollService:**

```typescript
// payroll.service.spec.ts
describe('PayrollService', () => {
  describe('computeNetPay()', () => {
    it('deducts LOP proportionally from basic salary', () => {
      const result = service.computeLopDeduction({
        basicSalary: 30_000, workingDays: 26, lopDays: 3
      });
      expect(result).toBe(3461.54); // 30000 / 26 * 3
    });

    it('deducts PF at 10% of basic', () => {
      const pf = service.computePfEmployee({ basicSalary: 20_000, pctRate: 10 });
      expect(pf).toBe(2_000);
    });

    it('throws if payroll run already exists for the period', async () => {
      mockPayrollRunRepo.findOne.mockResolvedValue({ id: 'existing-run' });
      await expect(service.initiateRun({ month: 1, year: 2026 }))
        .rejects.toThrow('Payroll run already exists');
    });

    it('blocks run if prior month is not closed', async () => {
      mockPayrollRunRepo.findOne.mockResolvedValue(null);
      mockGlPeriodRepo.findOne.mockResolvedValue({ status: 'open' });
      await expect(service.initiateRun({ month: 2, year: 2026 }))
        .rejects.toThrow('Prior GL period must be closed');
    });
  });
});
```

**GratuityService — Bangladesh Labour Act 2006 formula:**

```typescript
describe('GratuityService.compute()', () => {
  it.each([
    // [join, exit, basic, expectedGratuity]
    ['2020-01-01', '2026-01-01', 30_000, 207_692.31], // 6 full years
    ['2020-01-01', '2025-07-01', 30_000, 207_692.31], // 5y 6m → rounds to 6
    ['2020-01-01', '2025-06-01', 30_000, 173_076.92], // 5y 5m → stays at 5
    ['2025-01-01', '2025-10-01', 30_000, 0],           // < 1 year → 0
  ])('join=%s exit=%s basic=%d → %d', (join, exit, basic, expected) => {
    const result = service.compute({ joinDate: join, exitDate: exit, basicSalary: basic });
    expect(result).toBeCloseTo(expected, 2);
  });
});
```

**OrdersService — status state machine:**

```typescript
describe('OrdersService state machine', () => {
  it('confirmed → in_production requires sample_approved = true', async () => {
    mockOrderRepo.findOne.mockResolvedValue({ status: 'confirmed', sample_approved: false });
    await expect(service.transitionStatus('order-1', 'in_production'))
      .rejects.toThrow('Sample must be approved before production');
  });

  it('cannot skip from draft to in_production', async () => {
    mockOrderRepo.findOne.mockResolvedValue({ status: 'draft', sample_approved: true });
    await expect(service.transitionStatus('order-1', 'in_production'))
      .rejects.toThrow('Invalid status transition: draft → in_production');
  });

  it('fires OrderConfirmedEvent on successful confirmation', async () => {
    mockOrderRepo.findOne.mockResolvedValue({ status: 'draft', sample_approved: true, total_quantity: 500 });
    const emitSpy = jest.spyOn(eventEmitter, 'emit');
    await service.transitionStatus('order-1', 'confirmed');
    expect(emitSpy).toHaveBeenCalledWith(
      'order.confirmed',
      expect.objectContaining({ orderId: 'order-1' })
    );
  });
});
```

---

### 3.2 Unit Tests — Guards & Pipes

```typescript
// rbac.guard.spec.ts
describe('RbacGuard', () => {
  it('allows access when user has the required permission', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ module: 'orders', action: 'create' });
    mockPermissionCache.get.mockResolvedValue(['orders:create', 'orders:read']);
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when permission is absent', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ module: 'board', action: 'approve' });
    mockPermissionCache.get.mockResolvedValue(['orders:read']);
    await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
  });

  it('falls through to DB if Redis cache miss', async () => {
    mockPermissionCache.get.mockResolvedValue(null);
    const dbSpy = jest.spyOn(permissionsService, 'loadForUser').mockResolvedValue(['hr:read']);
    await guard.canActivate(mockContext);
    expect(dbSpy).toHaveBeenCalled();
  });
});
```

---

### 3.3 Integration Tests — HTTP Layer

These tests spin up a real NestJS application using `@nestjs/testing` with a dedicated test PostgreSQL database (via `testcontainers`). Each test suite runs inside a transaction that is rolled back after the suite, keeping tests isolated.

```typescript
// orders.integration.spec.ts
describe('Orders API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp(); // spins up full NestJS app
    prisma = app.get(PrismaService);
    authToken = await getTestToken(app, 'order_manager');
  });

  afterEach(async () => {
    await prisma.$executeRaw`ROLLBACK`;
  });

  describe('POST /api/orders', () => {
    it('creates a draft order and returns 201', async () => {
      const buyer = await seedBuyer(prisma);
      const article = await seedArticle(prisma);

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          buyerId: buyer.id,
          articleId: article.id,
          unitPrice: 12.50,
          totalQuantity: 500,
          deliveryDate: '2026-09-01',
          currency: 'USD',
          orderLines: [
            { sizeLabel: '38', quantity: 100 },
            { sizeLabel: '39', quantity: 200 },
            { sizeLabel: '40', quantity: 200 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.orderNumber).toMatch(/^ORD-\d{6}$/);
    });

    it('returns 422 if orderLines quantities do not sum to totalQuantity', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validOrderPayload,
          totalQuantity: 500,
          orderLines: [{ sizeLabel: '38', quantity: 100 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toBe('orderLines');
    });

    it('returns 403 if user lacks orders:create permission', async () => {
      const readOnlyToken = await getTestToken(app, 'employee_ess');
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send(validOrderPayload);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('blocks in_production transition when sample_approved is false', async () => {
      const order = await seedOrder(prisma, { status: 'confirmed', sampleApproved: false });
      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'in_production' });

      expect(res.status).toBe(422);
      expect(res.body.detail).toContain('Sample must be approved');
    });
  });
});
```

---

### 3.4 Database Tests — Triggers, Functions & Constraints

These tests hit a real PostgreSQL instance and verify database-level enforcement that cannot be tested purely in application code.

```typescript
// db-triggers.spec.ts
describe('Database: inv.update_stock_balance trigger', () => {
  it('increments balance on GRN insert', async () => {
    await prisma.inv_stock_transactions.create({
      data: {
        itemId: item.id, warehouseId: wh.id,
        direction: 1, quantity: 100,
        txnType: 'grn', txnDate: new Date(),
      },
    });
    const balance = await prisma.inv_stock_balances.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: wh.id } },
    });
    expect(Number(balance.quantity)).toBe(100);
  });

  it('decrements balance on production issue', async () => {
    await seedStockBalance(prisma, { itemId: item.id, warehouseId: wh.id, quantity: 200 });
    await prisma.inv_stock_transactions.create({
      data: {
        itemId: item.id, warehouseId: wh.id,
        direction: -1, quantity: 50,
        txnType: 'production_issue', txnDate: new Date(),
      },
    });
    const balance = await prisma.inv_stock_balances.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: wh.id } },
    });
    expect(Number(balance.quantity)).toBe(150);
  });

  it('raises error if stock would go negative', async () => {
    await seedStockBalance(prisma, { itemId: item.id, warehouseId: wh.id, quantity: 10 });
    await expect(
      prisma.inv_stock_transactions.create({
        data: {
          itemId: item.id, warehouseId: wh.id,
          direction: -1, quantity: 50,
          txnType: 'production_issue', txnDate: new Date(),
        },
      })
    ).rejects.toThrow(/check_balance_non_negative/);
  });
});

describe('Database: fin.check_period_open trigger', () => {
  it('prevents GL posting to a locked period', async () => {
    const lockedPeriod = await seedGlPeriod(prisma, { status: 'locked' });
    const entry = await seedGlEntry(prisma, { periodId: lockedPeriod.id, status: 'draft' });
    await expect(
      prisma.fin_gl_entry_lines.create({
        data: {
          glEntryId: entry.id,
          accountId: assetAccount.id,
          debit: 5000, credit: 0,
          entryDate: new Date(),
        },
      })
    ).rejects.toThrow(/locked GL period/);
  });
});

describe('Database: hr.compute_gratuity() function', () => {
  it('returns correct gratuity for 6 completed years', async () => {
    const result = await prisma.$queryRaw`
      SELECT hr.compute_gratuity(${employeeId}::uuid, '2026-01-01'::date) AS gratuity
    `;
    expect(Number(result[0].gratuity)).toBeCloseTo(207_692.31, 2);
  });
});
```

---

## 4. Frontend Testing

### 4.1 Component Tests — Vitest + React Testing Library

```typescript
// OrderStatusBadge.test.tsx
describe('<OrderStatusBadge />', () => {
  it.each([
    ['draft',         'Draft',         'bg-gray-100'],
    ['confirmed',     'Confirmed',     'bg-blue-100'],
    ['in_production', 'In Production', 'bg-yellow-100'],
    ['delivered',     'Delivered',     'bg-green-100'],
    ['cancelled',     'Cancelled',     'bg-red-100'],
  ])('renders correct label and style for status=%s', (status, label, className) => {
    render(<OrderStatusBadge status={status as OrderStatus} />);
    const badge = screen.getByText(label);
    expect(badge).toBeInTheDocument();
    expect(badge.closest('span')).toHaveClass(className);
  });
});
```

```typescript
// LeaveRequestForm.test.tsx
describe('<LeaveRequestForm />', () => {
  it('shows error when end_date is before start_date', async () => {
    render(<LeaveRequestForm />);
    await userEvent.type(screen.getByLabelText('Start date'), '2026-03-10');
    await userEvent.type(screen.getByLabelText('End date'),   '2026-03-05');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('End date must be after start date')).toBeInTheDocument();
  });

  it('disables submit while API call is in-flight', async () => {
    server.use(http.post('/api/leave-requests', async () => {
      await delay(500);
      return HttpResponse.json({});
    }));
    render(<LeaveRequestForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
  });

  it('shows server-side field error mapped from RFC 7807 response', async () => {
    server.use(http.post('/api/leave-requests', () =>
      HttpResponse.json(
        { type: '/errors/validation', errors: [{ field: 'leaveTypeId', message: 'Insufficient balance' }] },
        { status: 422 }
      )
    ));
    render(<LeaveRequestForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
  });
});
```

---

### 4.2 Hook Tests

```typescript
// usePayslipDownload.test.ts
describe('usePayslipDownload', () => {
  it('fetches pre-signed URL and triggers browser download', async () => {
    server.use(http.get('/api/payroll/entries/:id/payslip', () =>
      HttpResponse.json({ downloadUrl: 'https://s3.../payslip.pdf' })
    ));
    const { result } = renderHook(() => usePayslipDownload());
    act(() => { result.current.download('entry-123'); });
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it('shows error toast when download URL fetch fails', async () => {
    server.use(http.get('/api/payroll/entries/:id/payslip', () => HttpResponse.error()));
    const { result } = renderHook(() => usePayslipDownload());
    act(() => { result.current.download('entry-123'); });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
  });
});
```

---

### 4.3 Zod Schema Tests

Every Zod schema in the project has its own spec file verifying pass/fail cases:

```typescript
// createOrderSchema.test.ts
describe('createOrderSchema', () => {
  it('accepts a valid payload', () => {
    expect(() => createOrderSchema.parse(validPayload)).not.toThrow();
  });

  it('rejects empty orderLines array', () => {
    const result = createOrderSchema.safeParse({ ...validPayload, orderLines: [] });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain('orderLines');
  });

  it('rejects unit_price of zero', () => {
    const result = createOrderSchema.safeParse({ ...validPayload, unitPrice: 0 });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toBe('Price must be greater than 0');
  });
});
```

---

## 5. E2E Tests — Playwright

E2E tests run against a fully deployed staging environment on every PR merge to `main`. Tests cover complete user journeys without any mocking.

### 5.1 Test Structure

```
tests/e2e/
├── auth/
│   ├── login.spec.ts           ← login, 2FA, lockout, session refresh
│   └── rbac.spec.ts            ← page-level access enforcement
├── orders/
│   ├── create-order.spec.ts    ← full order creation with size grid
│   └── order-lifecycle.spec.ts ← draft → confirmed → delivered
├── payroll/
│   └── payroll-run.spec.ts     ← full payroll run wizard
├── leave/
│   └── leave-workflow.spec.ts  ← apply → manager approve → balance update
├── inventory/
│   └── stock-movement.spec.ts  ← GRN → stock balance update visible in UI
└── board/
    └── resolution.spec.ts      ← create meeting → pass resolution → verify hash
```

### 5.2 Example: Full Payroll Run E2E

```typescript
// payroll-run.spec.ts
test('HR Manager can complete a full payroll run end-to-end', async ({ page }) => {
  await loginAs(page, 'hr_manager');
  await page.goto('/hr/payroll');

  // Step 1: Initiate run
  await page.getByRole('button', { name: 'Run Payroll' }).click();
  await expect(page.getByText('Select period')).toBeVisible();
  await page.getByLabel('Month').selectOption('5');
  await page.getByLabel('Year').fill('2026');
  await page.getByRole('button', { name: 'Start computation' }).click();

  // Step 2: Wait for BullMQ job to complete
  await expect(page.getByTestId('payroll-status'))
    .toHaveText('Processed', { timeout: 60_000 });

  // Step 3: Verify totals are populated
  await expect(page.getByTestId('total-net-pay')).toContainText('BDT');
  await expect(page.getByTestId('employee-count')).not.toHaveText('0');

  // Step 4: Finance Manager approves
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await loginAs(page, 'finance_manager');
  await page.goto('/hr/payroll');
  await page.getByTestId('pending-approval-badge').click();
  await page.getByRole('button', { name: 'Approve disbursement' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('payroll-status')).toHaveText('Disbursed');

  // Step 5: Employee can see and download payslip
  const employeeEmail = await getTestEmployeeEmail();
  await loginAs(page, 'employee_ess', employeeEmail);
  await page.goto('/ess/payslip');
  await expect(page.getByText('May 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toMatch(/payslip.*\.pdf/);
});
```

### 5.3 Example: RBAC Enforcement E2E

```typescript
// rbac.spec.ts
const restrictedPages = [
  { path: '/finance/gl',        role: 'factory_manager', expectedStatus: 403 },
  { path: '/board/resolutions', role: 'hr_manager',      expectedStatus: 403 },
  { path: '/system/users',      role: 'order_manager',   expectedStatus: 403 },
  { path: '/hr/payroll/run',    role: 'employee_ess',    expectedStatus: 403 },
];

for (const { path, role, expectedStatus } of restrictedPages) {
  test(`${role} is blocked from ${path}`, async ({ page }) => {
    await loginAs(page, role);
    await page.goto(path);
    await expect(page.getByTestId('access-denied')).toBeVisible();

    // API call is also blocked
    const apiRes = await page.request.get(`/api${path}`);
    expect(apiRes.status()).toBe(expectedStatus);
  });
}
```

---

## 6. API Contract Testing — Pact

Pact ensures the frontend's Axios API calls always match what the NestJS backend actually returns. Consumer (React) defines the contract; provider (NestJS) verifies it on every CI run.

```typescript
// orders.pact.spec.ts  — consumer side (React)
describe('Orders API contract', () => {
  it('GET /api/orders/:id returns expected shape', async () => {
    await provider.addInteraction({
      state: 'order ORD-000001 exists',
      uponReceiving: 'a request for order details',
      withRequest: {
        method: 'GET',
        path: '/api/orders/ORD-000001',
        headers: { Authorization: like('Bearer token') },
      },
      willRespondWith: {
        status: 200,
        body: {
          data: {
            id:            like('uuid'),
            orderNumber:   like('ORD-000001'),
            status:        like('confirmed'),
            buyer:         { id: like('uuid'), name: like('Bay Stores') },
            unitPrice:     like(12.50),
            totalQuantity: like(500),
            orderLines:    eachLike({ sizeLabel: like('38'), quantity: like(100) }),
          },
        },
      },
    });
    const result = await ordersApi.getById('ORD-000001');
    expect(result.data.orderNumber).toBeDefined();
  });
});

// orders.pact.spec.ts  — provider side (NestJS)
describe('Pact provider verification: NestJS', () => {
  it('validates all consumer contracts', () => {
    return new Verifier({
      provider: 'NestJS-API',
      providerBaseUrl: 'http://localhost:3000',
      pactUrls: ['./pacts/ReactApp-NestJS-API.json'],
      stateHandlers: {
        'order ORD-000001 exists': async () => {
          await seedOrder(prisma, { orderNumber: 'ORD-000001' });
        },
      },
    }).verifyProvider();
  });
});
```

---

## 7. Performance Tests — k6

```javascript
// k6/api-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const apiDuration = new Trend('api_duration');

export const options = {
  scenarios: {
    normal_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
    },
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95th percentile < 500ms
    http_req_failed:   ['rate<0.01'],                  // < 1% error rate
    api_duration:      ['p(95)<300'],
  },
};

export default function () {
  const token = __ENV.API_TOKEN;
  const res = http.get('http://api.okfootwear.local/api/orders', {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  apiDuration.add(res.timings.duration);
  sleep(1);
}
```

---

## 8. Security Tests

```typescript
// security/auth.security.spec.ts
describe('Authentication security', () => {
  it('rejects a tampered JWT signature', async () => {
    const validToken = await getValidToken();
    const [header, payload] = validToken.split('.');
    const tamperedToken = `${header}.${payload}.invalidsignature`;
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired access token', async () => {
    const expiredToken = sign({ sub: userId }, SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.title).toBe('Token expired');
  });

  it('locks account after 5 consecutive failed logins', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_EMAIL, password: 'wrongpassword' });
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' });
    expect(res.status).toBe(429);
    expect(res.body.detail).toContain('Account locked');
  });

  it('prevents SQL injection in search parameters', async () => {
    const res = await request(app)
      .get("/api/employees?search=' OR 1=1 --")
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]); // no data leaked
  });

  it('enforces CORS and rejects requests from unknown origins', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Origin', 'https://attacker.com')
      .set('Authorization', `Bearer ${token}`);
    expect(res.headers['access-control-allow-origin'])
      .not.toBe('https://attacker.com');
  });
});
```

---

## 9. CI/CD Pipeline Integration

```yaml
# .github/workflows/test.yml
name: Full Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Enforce coverage thresholds
        run: |
          npx istanbul check-coverage \
            --statements 80 --branches 75 --functions 80 --lines 80

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: erp_test
          POSTGRES_USER: erp
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s --health-timeout 3s --health-retries 10
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping" --health-interval 5s
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: postgresql://erp:test@localhost:5432/erp_test }
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://erp:test@localhost:5432/erp_test
          REDIS_URL: redis://localhost:7379

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:vitest -- --coverage
      - run: npm run chromatic -- --project-token=${{ secrets.CHROMATIC_TOKEN }}

  contract-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:pact:consumer
      - run: npm run test:pact:provider

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [contract-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox
      - run: npm run test:e2e
        env: { BASE_URL: https://staging.okfootwear.com }
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  performance-tests:
    runs-on: ubuntu-latest
    needs: [e2e-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: |
          curl -L https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz | tar xz
          ./k6 run k6/api-load.js --env API_TOKEN=${{ secrets.STAGING_TOKEN }}

  security-scan:
    runs-on: ubuntu-latest
    needs: [e2e-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: npm run test:security
      - name: OWASP ZAP baseline scan
        uses: zaproxy/action-baseline@v0.11.0
        with:
          target: https://staging.okfootwear.com
```

---

## 10. Coverage Targets

| Layer | Statements | Branches | Functions |
|---|---|---|---|
| Backend services | ≥ 85% | ≥ 80% | ≥ 85% |
| Backend controllers | ≥ 90% | ≥ 85% | ≥ 90% |
| Backend guards & pipes | ≥ 95% | ≥ 90% | ≥ 95% |
| DB triggers & functions | 100% | 100% | 100% |
| Frontend components | ≥ 80% | ≥ 75% | ≥ 80% |
| Frontend hooks | ≥ 90% | ≥ 85% | ≥ 90% |
| Zod schemas | 100% | 100% | 100% |
| **Overall** | **≥ 80%** | **≥ 75%** | **≥ 80%** |

Coverage thresholds are enforced in CI — the pipeline fails if any threshold is breached.

---

## 11. Test Data Management

```typescript
// test/factories/index.ts — centralised seed factories
import { faker } from '@faker-js/faker';

export const orderFactory = {
  build: (overrides = {}) => ({
    buyerId:       faker.string.uuid(),
    articleId:     faker.string.uuid(),
    unitPrice:     faker.number.float({ min: 5, max: 50, fractionDigits: 2 }),
    totalQuantity: faker.number.int({ min: 100, max: 2000 }),
    deliveryDate:  faker.date.future({ years: 1 }).toISOString().split('T')[0],
    currency:      'USD',
    ...overrides,
  }),
  create: async (prisma, overrides = {}) => {
    const buyer   = await buyerFactory.create(prisma);
    const article = await articleFactory.create(prisma);
    return prisma.ord_orders.create({
      data: orderFactory.build({ buyerId: buyer.id, articleId: article.id, ...overrides }),
    });
  },
};
```

All integration and E2E tests use factories — never hardcoded IDs or dates. The staging environment is reset to a known seed state before each E2E run using a dedicated `npm run db:seed:staging` script.

---

## 12. Summary

| What | Tool | When it runs |
|---|---|---|
| Backend unit tests | Jest | Every commit |
| DB triggers & functions | Jest + real PostgreSQL | Every commit |
| Frontend unit + components | Vitest + RTL | Every commit |
| Visual regression | Chromatic | Every PR |
| Backend integration tests | Supertest + testcontainers | Every PR |
| API contract tests | Pact | Every PR |
| E2E critical user journeys | Playwright | Merge to `main` |
| Performance load tests | k6 | Merge to `main` |
| Security tests | Jest + OWASP ZAP | Nightly on staging |
| Mutation testing | Stryker | Weekly |

---

*OK Footwear ERP — Testing Strategy · Version 1.0 · May 2025*
