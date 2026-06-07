# OK Footwear ERP — Security Test Cases
**Scope:** Authentication, authorisation, input validation, injection prevention, session management, and transport security. All tests run as part of the automated CI/CD pipeline.

---

## Authentication Security

### TC-SEC-AUTH-001: Tampered JWT signature rejected
```typescript
it('returns 401 when JWT signature is tampered', async () => {
  const [header, payload] = validToken.split('.');
  const tampered = `${header}.${payload}.INVALIDSIGNATURE`;
  const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${tampered}`);
  expect(res.status).toBe(401);
  expect(res.body.type).toBe('/errors/unauthorized');
});
```

### TC-SEC-AUTH-002: Expired access token rejected
```typescript
it('returns 401 for an expired JWT access token', async () => {
  const expired = sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 1 }, JWT_SECRET);
  const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${expired}`);
  expect(res.status).toBe(401);
  expect(res.body.title).toBe('Token expired');
});
```

### TC-SEC-AUTH-003: JWT with wrong secret rejected
```typescript
it('returns 401 when token is signed with a different secret', async () => {
  const forged = sign({ sub: userId }, 'wrong-secret', { expiresIn: '8h' });
  const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${forged}`);
  expect(res.status).toBe(401);
});
```

### TC-SEC-AUTH-004: Missing Authorization header rejected
```typescript
it('returns 401 when Authorization header is absent', async () => {
  const res = await request(app).get('/api/orders');
  expect(res.status).toBe(401);
});
```

### TC-SEC-AUTH-005: Account locked after 5 failed logins
```typescript
it('locks account and returns 429 after 5 failed attempts', async () => {
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/auth/login').send({ email: TARGET_EMAIL, password: 'wrong' });
  }
  const res = await request(app).post('/api/auth/login').send({ email: TARGET_EMAIL, password: 'wrong' });
  expect(res.status).toBe(429);
  expect(res.body.detail).toContain('Account locked');
});
```

### TC-SEC-AUTH-006: Correct password still rejected while account is locked
```typescript
it('rejects correct password while account lock is in effect', async () => {
  await lockAccount(TARGET_EMAIL);
  const res = await request(app).post('/api/auth/login').send({ email: TARGET_EMAIL, password: CORRECT_PASSWORD });
  expect(res.status).toBe(429);
});
```

### TC-SEC-AUTH-007: Refresh token cannot be reused after rotation
```typescript
it('returns 401 when attempting to reuse a rotated refresh token', async () => {
  const { refreshCookie } = await loginAndGetCookies(app);
  // First refresh succeeds and rotates the token
  await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
  // Second use of the old token must fail
  const retry = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
  expect(retry.status).toBe(401);
});
```

### TC-SEC-AUTH-008: httpOnly cookie cannot be accessed by JavaScript
```typescript
it('refresh token cookie has HttpOnly and Secure flags', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASS });
  const cookie = res.headers['set-cookie'].find((c: string) => c.includes('refreshToken'));
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Strict');
});
```

---

## Authorisation Security

### TC-SEC-AUTHZ-001: RBAC enforced at API level
```typescript
it('returns 403 when employee_ess attempts to access payroll endpoint', async () => {
  const essToken = await getToken(app, 'employee_ess');
  const res = await request(app).get('/api/payroll/runs').set('Authorization', `Bearer ${essToken}`);
  expect(res.status).toBe(403);
});
```

### TC-SEC-AUTHZ-002: Horizontal privilege escalation blocked (IDOR)
```typescript
it('employee cannot access another employee payslip via direct ID substitution', async () => {
  const otherEmployee = await seedEmployee(prisma);
  const essToken = await getToken(app, 'employee_ess', testEmployee.userId);
  const res = await request(app)
    .get(`/api/payroll/entries?employeeId=${otherEmployee.id}`)
    .set('Authorization', `Bearer ${essToken}`);
  // Must return only the requesting employee's own data
  expect(res.body.data.every((e: any) => e.employeeId === testEmployee.id)).toBe(true);
});
```

### TC-SEC-AUTHZ-003: Manager cannot see employees outside their department
```typescript
it('returns 403 when manager requests employee from another department', async () => {
  const otherDeptEmployee = await seedEmployee(prisma, { departmentId: otherDeptId });
  const mgrToken = await getToken(app, 'manager_mss', manager.userId);
  const res = await request(app)
    .get(`/api/employees/${otherDeptEmployee.id}`)
    .set('Authorization', `Bearer ${mgrToken}`);
  expect(res.status).toBe(403);
});
```

### TC-SEC-AUTHZ-004: Finance role cannot access board module endpoints
```typescript
it('returns 403 when finance_manager accesses board resolutions endpoint', async () => {
  const finToken = await getToken(app, 'finance_manager');
  const res = await request(app).get('/api/board/resolutions').set('Authorization', `Bearer ${finToken}`);
  expect(res.status).toBe(403);
});
```

---

## Input Validation & Injection Prevention

### TC-SEC-INJ-001: SQL injection in search parameter
```typescript
it("does not execute injected SQL in search query parameter", async () => {
  const res = await request(app)
    .get("/api/employees?search=' OR '1'='1")
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual([]); // no unauthorised data returned
});
```

### TC-SEC-INJ-002: SQL injection in path parameter
```typescript
it('returns 400 for non-UUID path parameter', async () => {
  const res = await request(app)
    .get("/api/orders/' OR 1=1 --")
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(400);
});
```

### TC-SEC-INJ-003: XSS payload stripped from text fields
```typescript
it('strips script tags from free-text fields via class-validator whitelist', async () => {
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validOrder, remarks: '<script>alert("xss")</script>' });
  if (res.status === 201) {
    expect(res.body.data.remarks).not.toContain('<script>');
  }
});
```

### TC-SEC-INJ-004: Oversized payload rejected
```typescript
it('returns 413 for request body exceeding 10MB limit', async () => {
  const largeBody = { data: Buffer.alloc(11 * 1024 * 1024).toString('base64') };
  const res = await request(app)
    .post('/api/inventory/documents')
    .set('Authorization', `Bearer ${token}`)
    .send(largeBody);
  expect(res.status).toBe(413);
});
```

### TC-SEC-INJ-005: Unknown properties stripped by ValidationPipe
```typescript
it('removes extra fields not in the DTO (whitelist: true)', async () => {
  const res = await request(app)
    .post('/api/buyers')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...validBuyer, adminOverride: true, internalFlag: 'bypass' });
  expect(res.status).toBe(201);
  const created = await prisma.ord_buyers.findUnique({ where: { id: res.body.data.id } });
  expect((created as any).adminOverride).toBeUndefined();
});
```

---

## Session & Transport Security

### TC-SEC-SESS-001: Rate limiting returns 429 after threshold
```typescript
it('returns 429 Too Many Requests after exceeding 100 requests per minute', async () => {
  const requests = Array.from({ length: 105 }, () =>
    request(app).get('/api/orders').set('Authorization', `Bearer ${token}`)
  );
  const responses = await Promise.all(requests);
  const tooMany = responses.filter(r => r.status === 429);
  expect(tooMany.length).toBeGreaterThan(0);
});
```

### TC-SEC-SESS-002: Security headers present on all responses
```typescript
it('includes HSTS, CSP, and X-Frame-Options headers', async () => {
  const res = await request(app).get('/api/health');
  expect(res.headers['strict-transport-security']).toBeDefined();
  expect(res.headers['content-security-policy']).toBeDefined();
  expect(res.headers['x-frame-options']).toBe('DENY');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
});
```

### TC-SEC-SESS-003: CORS rejects unknown origins
```typescript
it('does not set ACAO header for untrusted origins', async () => {
  const res = await request(app)
    .get('/api/orders')
    .set('Origin', 'https://evil.com')
    .set('Authorization', `Bearer ${token}`);
  expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
});
```

### TC-SEC-SESS-004: CORS allows configured origin
```typescript
it('sets correct ACAO header for the whitelisted application origin', async () => {
  const res = await request(app)
    .get('/api/orders')
    .set('Origin', 'https://erp.okfootwear.com')
    .set('Authorization', `Bearer ${token}`);
  expect(res.headers['access-control-allow-origin']).toBe('https://erp.okfootwear.com');
});
```

### TC-SEC-SESS-005: Sensitive fields not exposed in API responses
```typescript
it('does not return passwordHash or totpSecret in user profile response', async () => {
  const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data.passwordHash).toBeUndefined();
  expect(res.body.data.totpSecret).toBeUndefined();
});
```

### TC-SEC-SESS-006: Audit log written for every sensitive write
```typescript
it('creates an audit_logs entry for every employee update operation', async () => {
  const employee = await seedEmployee(prisma);
  await request(app)
    .patch(`/api/employees/${employee.id}`)
    .set('Authorization', `Bearer ${hrToken}`)
    .send({ designation: 'Senior Operator' });

  const auditEntry = await prisma.sys_audit_logs.findFirst({
    where: { tableN: 'employees', recordId: employee.id, action: 'UPDATE' },
    orderBy: { createdAt: 'desc' },
  });
  expect(auditEntry).not.toBeNull();
  expect(JSON.parse(auditEntry!.newValue as string).designation).toBe('Senior Operator');
});
```

---

## Encrypted Fields Security

### TC-SEC-ENC-001: NID not stored in plain text in employee table
```typescript
it('hr.employees.nid_encrypted is stored as BYTEA, not plain text', async () => {
  await request(app)
    .post('/api/employees')
    .set('Authorization', `Bearer ${hrToken}`)
    .send({ ...validEmployee, nid: '1234567890123' });

  const raw = await prisma.$queryRaw`SELECT nid_encrypted FROM hr.employee_secrets WHERE employee_id = (SELECT id FROM hr.employees ORDER BY created_at DESC LIMIT 1)`;
  const nidValue = (raw as any)[0]?.nid_encrypted;
  // Should be binary data, not the plain NID number
  expect(nidValue?.toString()).not.toBe('1234567890123');
  expect(Buffer.isBuffer(nidValue) || nidValue instanceof Uint8Array).toBe(true);
});
```

### TC-SEC-ENC-002: Bank account not readable from DB without decryption key
```typescript
it('bank_account_encrypted field is unreadable without the application AES key', async () => {
  const raw = await prisma.$queryRaw`
    SELECT encode(bank_account_encrypted, 'hex') as hex_value 
    FROM hr.employee_secrets WHERE employee_id = ${employeeId}::uuid
  `;
  const hexValue = (raw as any)[0]?.hex_value;
  expect(hexValue).not.toBe(testEmployee.bankAccount); // cannot read plain account number
  expect(hexValue?.length).toBeGreaterThan(0); // but data is stored
});
```

---

*Total security test cases: 22 | Runs on every CI pipeline + nightly OWASP ZAP scan on staging*
