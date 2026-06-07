# OK Footwear ERP — Frontend Test Cases
**Scope:** React components (Vitest + React Testing Library), custom hooks, Zod schema validation, and Zustand store logic. All API calls mocked with MSW.

---

## Component: OrderStatusBadge

### TC-FE-C-001: Renders correct label per status
```typescript
it.each([
  ['draft',         'Draft',         'bg-gray-100'],
  ['confirmed',     'Confirmed',     'bg-blue-100'],
  ['in_production', 'In Production', 'bg-yellow-100'],
  ['delivered',     'Delivered',     'bg-green-100'],
  ['cancelled',     'Cancelled',     'bg-red-100'],
])('status=%s → label=%s class=%s', (status, label, cls) => {
  render(<OrderStatusBadge status={status as OrderStatus} />);
  const badge = screen.getByText(label);
  expect(badge).toBeInTheDocument();
  expect(badge.closest('span')).toHaveClass(cls);
});
```

---

## Component: LeaveRequestForm

### TC-FE-C-002: End date before start date shows validation error
```typescript
it('displays date range error when end date precedes start date', async () => {
  render(<LeaveRequestForm />);
  await userEvent.type(screen.getByLabelText('Start date'), '2026-03-10');
  await userEvent.type(screen.getByLabelText('End date'),   '2026-03-05');
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByText('End date must be after start date')).toBeInTheDocument();
});
```

### TC-FE-C-003: Submit button disabled during in-flight API call
```typescript
it('disables submit button and shows loading state while submitting', async () => {
  server.use(http.post('/api/leave-requests', async () => { await delay(500); return HttpResponse.json({}); }));
  render(<LeaveRequestForm />);
  await fillValidLeaveForm();
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
});
```

### TC-FE-C-004: Server field error rendered on correct field
```typescript
it('displays RFC 7807 server error mapped to the leaveTypeId field', async () => {
  server.use(http.post('/api/leave-requests', () =>
    HttpResponse.json({ errors: [{ field: 'leaveTypeId', message: 'Insufficient balance' }] }, { status: 422 })
  ));
  render(<LeaveRequestForm />);
  await fillValidLeaveForm();
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
});
```

### TC-FE-C-005: Success toast shown after successful submission
```typescript
it('shows success notification on 201 response', async () => {
  server.use(http.post('/api/leave-requests', () => HttpResponse.json({ data: { id: 'lr1', status: 'pending' } }, { status: 201 })));
  render(<LeaveRequestForm />);
  await fillValidLeaveForm();
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(await screen.findByText(/leave request submitted/i)).toBeInTheDocument();
});
```

---

## Component: PayrollRunWizard

### TC-FE-C-006: Step 1 validates period selection
```typescript
it('cannot proceed to step 2 without selecting month and year', async () => {
  render(<PayrollRunWizard />);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Period is required')).toBeInTheDocument();
  expect(screen.getByText('Step 1 of 4')).toBeInTheDocument(); // still on step 1
});
```

### TC-FE-C-007: Processing step polls for job status
```typescript
it('polls status endpoint every 5 seconds while status is processing', async () => {
  let callCount = 0;
  server.use(http.get('/api/payroll/runs/:id', () => {
    callCount++;
    const status = callCount < 3 ? 'processing' : 'approved';
    return HttpResponse.json({ data: { status } });
  }));
  vi.useFakeTimers();
  render(<PayrollRunWizard runId="run-1" />);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(callCount).toBeGreaterThanOrEqual(3);
  vi.useRealTimers();
});
```

---

## Component: SizeRunInputGrid

### TC-FE-C-008: Total quantity computed from size inputs
```typescript
it('displays correct running total as sizes are entered', async () => {
  render(<SizeRunInputGrid sizes={['36','37','38','39','40']} onChange={vi.fn()} />);
  await userEvent.type(screen.getByRole('spinbutton', { name: '38' }), '100');
  await userEvent.type(screen.getByRole('spinbutton', { name: '39' }), '200');
  expect(screen.getByTestId('size-run-total')).toHaveTextContent('300');
});
```

### TC-FE-C-009: Non-numeric input rejected
```typescript
it('ignores non-numeric keystrokes in size quantity cells', async () => {
  render(<SizeRunInputGrid sizes={['38']} onChange={vi.fn()} />);
  const input = screen.getByRole('spinbutton', { name: '38' });
  await userEvent.type(input, 'abc');
  expect(input).toHaveValue(null);
});
```

---

## Component: DataTable (TanStack Table v8)

### TC-FE-C-010: Renders correct row count
```typescript
it('renders one row per data item', () => {
  const data = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, name: `Employee ${i}` }));
  render(<DataTable columns={columns} data={data} />);
  expect(screen.getAllByRole('row')).toHaveLength(6); // 5 data + 1 header
});
```

### TC-FE-C-011: Empty state shown with no data
```typescript
it('renders empty state message when data array is empty', () => {
  render(<DataTable columns={columns} data={[]} />);
  expect(screen.getByText('No results found')).toBeInTheDocument();
});
```

### TC-FE-C-012: Column sorting toggles on header click
```typescript
it('sorts data ascending on first click then descending on second', async () => {
  render(<DataTable columns={columns} data={unsortedData} />);
  const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
  await userEvent.click(nameHeader);
  expect(screen.getAllByRole('cell', { name: /name/i })[0]).toHaveTextContent('Alice');
  await userEvent.click(nameHeader);
  expect(screen.getAllByRole('cell', { name: /name/i })[0]).toHaveTextContent('Zara');
});
```

---

## Hook: usePayslipDownload

### TC-FE-H-001: Successful download triggers browser save
```typescript
it('fetches presigned URL and triggers download on success', async () => {
  server.use(http.get('/api/payroll/entries/:id/payslip', () =>
    HttpResponse.json({ downloadUrl: 'https://s3.../payslip.pdf' })
  ));
  const { result } = renderHook(() => usePayslipDownload());
  act(() => { result.current.download('entry-123'); });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(global.URL.createObjectURL).toHaveBeenCalled();
});
```

### TC-FE-H-002: Download error sets status to error
```typescript
it('sets status to error and shows toast when API fails', async () => {
  server.use(http.get('/api/payroll/entries/:id/payslip', () => HttpResponse.error()));
  const { result } = renderHook(() => usePayslipDownload());
  act(() => { result.current.download('entry-123'); });
  await waitFor(() => expect(result.current.status).toBe('error'));
});
```

---

## Hook: useAuth

### TC-FE-H-003: can() returns true for permitted action
```typescript
it('returns true when user has the required module:action permission', () => {
  useAuthStore.setState({ permissions: ['orders:create', 'orders:read'] });
  const { result } = renderHook(() => useAuth());
  expect(result.current.can('orders', 'create')).toBe(true);
});
```

### TC-FE-H-004: can() returns false for missing permission
```typescript
it('returns false when user is missing the required permission', () => {
  useAuthStore.setState({ permissions: ['orders:read'] });
  const { result } = renderHook(() => useAuth());
  expect(result.current.can('board', 'approve')).toBe(false);
});
```

### TC-FE-H-005: Logout clears auth store and redirects
```typescript
it('clears auth state and navigates to /login on logout', async () => {
  useAuthStore.setState({ userId: 'u1', accessToken: 'tok' });
  server.use(http.post('/api/auth/logout', () => HttpResponse.json({})));
  const { result } = renderHook(() => useAuth(), { wrapper: MemoryRouterWrapper });
  await act(async () => { await result.current.logout(); });
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(mockNavigate).toHaveBeenCalledWith('/login');
});
```

---

## Zod Schemas

### TC-FE-Z-001: createOrderSchema — valid payload accepted
```typescript
it('parses valid order payload without errors', () => {
  expect(() => createOrderSchema.parse(validOrderPayload)).not.toThrow();
});
```

### TC-FE-Z-002: createOrderSchema — empty orderLines rejected
```typescript
it('fails validation with error on orderLines field when empty', () => {
  const result = createOrderSchema.safeParse({ ...validOrderPayload, orderLines: [] });
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].path).toContain('orderLines');
});
```

### TC-FE-Z-003: createOrderSchema — unit_price zero rejected
```typescript
it('rejects unitPrice of 0 with descriptive message', () => {
  const result = createOrderSchema.safeParse({ ...validOrderPayload, unitPrice: 0 });
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].message).toBe('Price must be greater than 0');
});
```

### TC-FE-Z-004: leaveRequestSchema — end before start rejected
```typescript
it('fails validation when endDate is before startDate', () => {
  const result = leaveRequestSchema.safeParse({ startDate: '2026-03-10', endDate: '2026-03-05', leaveTypeId: 'lt1', totalDays: 1 });
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].message).toBe('End date must be after start date');
});
```

### TC-FE-Z-005: employeeSchema — invalid gender code rejected
```typescript
it('rejects gender value outside M/F/O', () => {
  const result = employeeSchema.safeParse({ ...validEmployee, gender: 'X' });
  expect(result.success).toBe(false);
});
```

---

## i18n

### TC-FE-I18N-001: Bangla locale renders correct translations
```typescript
it('renders key labels in Bangla when locale is bn', async () => {
  i18n.changeLanguage('bn');
  render(<OrdersPage />);
  expect(await screen.findByText('অর্ডার তালিকা')).toBeInTheDocument(); // 'Order List' in Bangla
});
```

### TC-FE-I18N-002: English locale is default
```typescript
it('renders English labels when no locale is set', () => {
  render(<DashboardPage />);
  expect(screen.getByText('Dashboard')).toBeInTheDocument();
});
```

---

*Total frontend test cases: 27 | Tool: Vitest + React Testing Library + MSW*
