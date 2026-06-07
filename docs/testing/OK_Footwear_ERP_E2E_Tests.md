# OK Footwear ERP — End-to-End Test Cases
**Scope:** Full browser flows using Playwright against a live staging environment. No mocking. Covers complete user journeys across all critical business workflows.

---

## Auth Flows

### TC-E2E-AUTH-001: Successful login and dashboard access
```typescript
test('user can log in with correct credentials and land on dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@okfootwear.com');
  await page.getByLabel('Password').fill('Admin@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByTestId('kpi-widget')).toBeVisible();
});
```

### TC-E2E-AUTH-002: Wrong password shows error message
```typescript
test('incorrect password displays error without redirecting', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@okfootwear.com');
  await page.getByLabel('Password').fill('WrongPassword');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL('/login');
});
```

### TC-E2E-AUTH-003: Account lockout after 5 failures
```typescript
test('account is locked after 5 consecutive failed login attempts', async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.goto('/login');
    await page.getByLabel('Email').fill('locktest@okfootwear.com');
    await page.getByLabel('Password').fill('WrongPassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByText(/account is locked/i)).toBeVisible();
});
```

### TC-E2E-AUTH-004: 2FA required for MD role
```typescript
test('MD role user is prompted for TOTP code after password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('md@okfootwear.com');
  await page.getByLabel('Password').fill('MD@Admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter your 6-digit authentication code')).toBeVisible();
});
```

### TC-E2E-AUTH-005: Session auto-refreshes without user interaction
```typescript
test('user session is maintained across page navigations via silent token refresh', async ({ page }) => {
  await loginAs(page, 'order_manager');
  // Wait for access token to approach expiry (test env has short expiry)
  await page.waitForTimeout(2000);
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  // Should not redirect to /login
  await expect(page).not.toHaveURL('/login');
});
```

---

## Order Lifecycle

### TC-E2E-ORD-001: Create order with size breakdown
```typescript
test('order manager creates a bulk order with full size run', async ({ page }) => {
  await loginAs(page, 'order_manager');
  await page.goto('/orders/new');
  await page.getByLabel('Buyer').selectOption('Bay Stores');
  await page.getByLabel('Article').selectOption('MEN-CASUAL-001');
  await page.getByLabel('Unit price (USD)').fill('12.50');
  await page.getByLabel('Delivery date').fill('2026-09-01');

  // Size run grid
  await page.getByRole('spinbutton', { name: '38' }).fill('100');
  await page.getByRole('spinbutton', { name: '39' }).fill('200');
  await page.getByRole('spinbutton', { name: '40' }).fill('200');

  expect(page.getByTestId('size-run-total')).toContainText('500');
  await page.getByRole('button', { name: 'Create order' }).click();

  await expect(page.getByTestId('order-status-badge')).toHaveText('Draft');
  await expect(page.getByTestId('order-number')).toContainText('ORD-');
});
```

### TC-E2E-ORD-002: Full order lifecycle draft to delivered
```typescript
test('order progresses through full lifecycle draft → confirmed → in_production → delivered', async ({ page }) => {
  await loginAs(page, 'order_manager');
  const orderId = await createTestOrder(page);

  // Confirm sample
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Approve sample' }).click();
  await expect(page.getByTestId('sample-badge')).toHaveText('Approved');

  // Confirm order
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByTestId('order-status-badge')).toHaveText('Confirmed');

  // Move to production
  await loginAs(page, 'factory_manager');
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Start production' }).click();
  await expect(page.getByTestId('order-status-badge')).toHaveText('In Production');

  // Deliver
  await loginAs(page, 'order_manager');
  await page.goto(`/orders/${orderId}`);
  await page.getByRole('button', { name: 'Mark as delivered' }).click();
  await expect(page.getByTestId('order-status-badge')).toHaveText('Delivered');
});
```

### TC-E2E-ORD-003: Sample gate blocks production without approval
```typescript
test('in_production button is disabled when sample has not been approved', async ({ page }) => {
  await loginAs(page, 'order_manager');
  const orderId = await createAndConfirmOrder(page, { approvedSample: false });
  await page.goto(`/orders/${orderId}`);
  const prodBtn = page.getByRole('button', { name: 'Start production' });
  await expect(prodBtn).toBeDisabled();
  await expect(page.getByText('Approve sample before starting production')).toBeVisible();
});
```

---

## Payroll Run

### TC-E2E-PAY-001: Complete payroll run from initiation to disbursement
```typescript
test('HR Manager completes full payroll run; employees can download payslips', async ({ page }) => {
  // HR Manager initiates
  await loginAs(page, 'hr_manager');
  await page.goto('/hr/payroll');
  await page.getByRole('button', { name: 'Run Payroll' }).click();
  await page.getByLabel('Month').selectOption('5');
  await page.getByLabel('Year').fill('2026');
  await page.getByRole('button', { name: 'Start computation' }).click();
  await expect(page.getByTestId('payroll-status')).toHaveText('Processed', { timeout: 60_000 });
  await expect(page.getByTestId('employee-count')).not.toHaveText('0');

  // Finance Manager approves
  await loginAs(page, 'finance_manager');
  await page.goto('/hr/payroll');
  await page.getByTestId('pending-approval-badge').click();
  await page.getByRole('button', { name: 'Approve disbursement' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('payroll-status')).toHaveText('Disbursed');

  // Employee downloads payslip
  await loginAs(page, 'employee_ess', testEmployee.email);
  await page.goto('/ess/payslip');
  await expect(page.getByText('May 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toMatch(/payslip.*\.pdf$/);
});
```

### TC-E2E-PAY-002: Duplicate payroll run is blocked
```typescript
test('initiating a second run for the same month shows error', async ({ page }) => {
  await loginAs(page, 'hr_manager');
  await page.goto('/hr/payroll');
  await page.getByRole('button', { name: 'Run Payroll' }).click();
  await page.getByLabel('Month').selectOption('5');
  await page.getByLabel('Year').fill('2026');
  await page.getByRole('button', { name: 'Start computation' }).click();
  await expect(page.getByText('A payroll run already exists for this period')).toBeVisible();
});
```

---

## Leave Workflow

### TC-E2E-LEAVE-001: Employee applies → Manager approves → Balance updates
```typescript
test('full leave workflow updates balance after manager approval', async ({ page }) => {
  // Employee applies
  await loginAs(page, 'employee_ess', testEmployee.email);
  await page.goto('/ess/leave');
  const balanceBefore = await page.getByTestId('casual-leave-balance').textContent();

  await page.getByRole('button', { name: 'Apply for leave' }).click();
  await page.getByLabel('Leave type').selectOption('Casual Leave');
  await page.getByLabel('Start date').fill('2026-06-10');
  await page.getByLabel('End date').fill('2026-06-11');
  await page.getByLabel('Reason').fill('Personal work');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Leave request submitted')).toBeVisible();

  // Manager approves
  await loginAs(page, 'manager_mss', testEmployee.manager.email);
  await page.goto('/mss/approvals');
  await page.getByTestId('leave-approval-queue').getByText(testEmployee.name).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Leave approved')).toBeVisible();

  // Balance updated
  await loginAs(page, 'employee_ess', testEmployee.email);
  await page.goto('/ess/leave');
  const balanceAfter = await page.getByTestId('casual-leave-balance').textContent();
  expect(parseFloat(balanceAfter!) - parseFloat(balanceBefore!)).toBeLessThan(0);
});
```

### TC-E2E-LEAVE-002: Insufficient balance blocks submission
```typescript
test('leave form shows error when applying for more days than available balance', async ({ page }) => {
  await loginAs(page, 'employee_ess', employeeWith1DayBalance.email);
  await page.goto('/ess/leave');
  await page.getByRole('button', { name: 'Apply for leave' }).click();
  await page.getByLabel('Leave type').selectOption('Casual Leave');
  await page.getByLabel('Start date').fill('2026-06-10');
  await page.getByLabel('End date').fill('2026-06-15'); // 6 days, only 1 available
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Insufficient leave balance')).toBeVisible();
});
```

---

## Inventory Flow

### TC-E2E-INV-001: GRN updates stock balance visible in UI
```typescript
test('approved GRN immediately reflects in stock balance screen', async ({ page }) => {
  await loginAs(page, 'store_officer');
  await page.goto(`/inventory/items/${testItem.id}`);
  const balanceBefore = parseInt(await page.getByTestId('current-balance').textContent() ?? '0');

  // Create and approve GRN
  await createAndApproveGrn(page, { itemId: testItem.id, quantity: 100 });

  await page.goto(`/inventory/items/${testItem.id}`);
  const balanceAfter = parseInt(await page.getByTestId('current-balance').textContent() ?? '0');
  expect(balanceAfter).toBe(balanceBefore + 100);
});
```

### TC-E2E-INV-002: Stock count variance workflow
```typescript
test('store officer submits count with variance; Finance Manager approves', async ({ page }) => {
  await loginAs(page, 'store_officer');
  await page.goto('/inventory/stock-counts/new');
  await page.getByLabel('Warehouse').selectOption('Raw Material Store');
  await page.getByRole('button', { name: 'Open count sheet' }).click();

  // Enter physical count with variance
  const row = page.getByTestId(`count-row-${testItem.id}`);
  await row.getByRole('spinbutton').fill('85'); // system has 100

  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Count submitted for variance review')).toBeVisible();

  // Finance Manager reviews variance
  await loginAs(page, 'finance_manager');
  await page.goto('/inventory/stock-counts');
  await page.getByText('Variance Review').first().click();
  await page.getByRole('button', { name: 'Approve count' }).click();
  await expect(page.getByTestId('count-status')).toHaveText('Approved');
});
```

---

## Board Governance

### TC-E2E-BRD-001: Board resolution with eSign and hash
```typescript
test('Company Secretary creates resolution; Chairman eSigns; hash recorded', async ({ page }) => {
  await loginAs(page, 'company_secretary');
  await page.goto('/board/meetings/new');
  await fillMeetingDetails(page);
  await page.getByRole('button', { name: 'Schedule meeting' }).click();

  // Add agenda and hold meeting
  await page.getByRole('button', { name: 'Add agenda item' }).click();
  await page.getByLabel('Title').fill('Approval of Q1 Financial Statements');
  await page.getByRole('button', { name: 'Save agenda' }).click();
  await page.getByRole('button', { name: 'Mark as held' }).click();

  // Draft and pass resolution
  await page.getByRole('button', { name: 'Add resolution' }).click();
  await page.getByLabel('Resolution text').fill('The Board hereby approves the Q1 2026 financial statements.');
  await page.getByRole('button', { name: 'Pass resolution' }).click();

  // Chairman eSigns (DocuSign callback simulated in test env)
  await simulateDocuSignCallback(page, { status: 'completed' });
  await page.goto('/board/resolutions');
  const latestResolution = page.getByTestId('resolution-row').first();
  await expect(latestResolution.getByTestId('sha256-hash')).not.toBeEmpty();
  await expect(latestResolution.getByTestId('signed-badge')).toHaveText('Signed');
});
```

---

## RBAC Enforcement

### TC-E2E-RBAC-001: Role-based page access
```typescript
const rbacMatrix = [
  { role: 'factory_manager', path: '/finance/gl',     blocked: true  },
  { role: 'hr_manager',      path: '/board',           blocked: true  },
  { role: 'order_manager',   path: '/system/users',    blocked: true  },
  { role: 'employee_ess',    path: '/hr/payroll/run',  blocked: true  },
  { role: 'finance_manager', path: '/finance/gl',      blocked: false },
  { role: 'hr_manager',      path: '/hr/employees',    blocked: false },
];

for (const { role, path, blocked } of rbacMatrix) {
  test(`${role} ${blocked ? 'cannot' : 'can'} access ${path}`, async ({ page }) => {
    await loginAs(page, role);
    await page.goto(path);
    if (blocked) {
      await expect(page.getByTestId('access-denied')).toBeVisible();
    } else {
      await expect(page.getByTestId('access-denied')).not.toBeVisible();
    }
  });
}
```

---

*Total E2E test cases: 18 | Tool: Playwright | Runs against staging on merge to main*
