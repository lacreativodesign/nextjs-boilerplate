import {
  changePasswordSchema,
  createClientSchema,
  createEmployeeSchema,
  createInvoiceSchema,
  createLeadSchema,
  createProjectSchema,
  createUserSchema,
  dateRangeSchema,
  idSchema,
  paginationSchema,
  searchSchema,
  tenantIdSchema,
  updateClientSchema,
  updateEmployeeSchema,
  updateInvoiceSchema,
  updateLeadSchema,
  updateProjectSchema,
  updateUserSchema,
  validatePartial,
  validateQuery,
  validateRequest,
} from '@/lib/validations';

describe('validation schemas', () => {
  it('validates common schemas (pagination/search/id/date range)', () => {
    expect(paginationSchema.parse({ page: '2', limit: '10' })).toMatchObject({ page: 2, limit: 10, sortOrder: 'desc' });
    expect(searchSchema.parse({ query: 'invoice 2025' }).query).toBe('invoice 2025');
    expect(idSchema.parse({ id: 'abc' })).toEqual({ id: 'abc' });
    expect(tenantIdSchema.parse({ tenantId: 'tenant-1' })).toEqual({ tenantId: 'tenant-1' });
    expect(dateRangeSchema.parse({ startDate: '2025-01-01', endDate: '2025-02-01' })).toBeTruthy();

    expect(() => dateRangeSchema.parse({ startDate: '2025-02-01', endDate: '2025-01-01' })).toThrow();
  });

  it('validates user/client/lead/project/employee schemas for valid and invalid data', () => {
    expect(
      createUserSchema.parse({
        email: 'user@example.com',
        displayName: 'Jane Doe',
        role: 'admin',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();
    expect(() => createUserSchema.parse({ email: 'invalid', displayName: 'x', role: 'admin', tenantId: '' })).toThrow();
    expect(updateUserSchema.parse({ displayName: 'Updated' })).toBeTruthy();

    expect(
      createClientSchema.parse({
        companyName: 'Acme Inc',
        contactName: 'John Client',
        email: 'client@example.com',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();
    expect(() => createClientSchema.parse({ companyName: 'A', contactName: '', email: 'bad', tenantId: '' })).toThrow();
    expect(updateClientSchema.parse({ industry: 'Manufacturing' })).toBeTruthy();

    expect(
      createLeadSchema.parse({
        title: 'New Enterprise Deal',
        contactName: 'Lead Person',
        email: 'lead@example.com',
        source: 'website',
        status: 'new',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();
    expect(() => createLeadSchema.parse({ title: 'N', contactName: 'x', email: 'bad', source: 'website', status: 'new', tenantId: '' })).toThrow();
    expect(updateLeadSchema.parse({ status: 'qualified' })).toBeTruthy();

    expect(
      createProjectSchema.parse({
        name: 'Migration',
        clientId: 'client-1',
        startDate: '2025-01-01',
        endDate: '2025-02-01',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();
    expect(() => createProjectSchema.parse({ name: 'M', clientId: '', startDate: 'bad', tenantId: '' })).toThrow();
    expect(updateProjectSchema.parse({ priority: 'high' })).toBeTruthy();

    expect(
      createEmployeeSchema.parse({
        userId: 'user-1',
        department: 'Engineering',
        position: 'Staff Engineer',
        employmentType: 'full_time',
        startDate: '2025-01-01',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();
    expect(() => createEmployeeSchema.parse({ userId: '', department: '', position: 'x', employmentType: 'full_time', startDate: 'bad', tenantId: '' })).toThrow();
    expect(updateEmployeeSchema.parse({ position: 'Director' })).toBeTruthy();
  });

  it('validates invoice schemas and password constraints', () => {
    expect(
      createInvoiceSchema.parse({
        clientId: 'client-1',
        items: [{ description: 'Consulting', quantity: 10, unitPrice: 100 }],
        currency: 'USD',
        tenantId: 'tenant-1',
      }),
    ).toBeTruthy();

    expect(() =>
      createInvoiceSchema.parse({
        clientId: '',
        items: [],
        currency: 'XXX',
        tenantId: '',
      }),
    ).toThrow();

    expect(updateInvoiceSchema.parse({ invoiceId: 'inv-1' })).toBeTruthy();

    expect(
      changePasswordSchema.parse({
        currentPassword: 'Current1!',
        newPassword: 'StrongPass1!',
        confirmPassword: 'StrongPass1!',
      }),
    ).toBeTruthy();
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'short',
        newPassword: 'weak',
        confirmPassword: 'different',
      }),
    ).toThrow();
  });

  it('validates request/query/partial helper wrappers', () => {
    const parsed = validateRequest(createClientSchema, {
      companyName: 'Acme Inc',
      contactName: 'John Client',
      email: 'client@example.com',
      tenantId: 'tenant-1',
    });
    expect(parsed.companyName).toBe('Acme Inc');

    expect(() => validateRequest(createClientSchema, { companyName: '' })).toThrow('Validation failed');

    const query = new URLSearchParams({ page: '3', limit: '25' });
    expect(validateQuery(paginationSchema, query)).toMatchObject({ page: 3, limit: 25 });

    expect(validatePartial(createClientSchema, { companyName: 'Updated Co' })).toEqual({ companyName: 'Updated Co' });
  });
});
