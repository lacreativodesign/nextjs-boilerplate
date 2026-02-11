import { calculateTax, calculateCompoundTax, DEFAULT_TAX_RATES, isClientTaxExempt, TaxExemption, TaxType } from '@/lib/finance/tax';

describe('finance/tax', () => {
  it('calculates single tax correctly', () => {
    const result = calculateTax(100, 7.25);

    expect(result).toEqual({
      subtotal: 100,
      taxRate: 7.25,
      taxAmount: 7.25,
      total: 107.25,
      taxBreakdown: [{ name: 'Tax', rate: 7.25, amount: 7.25 }],
    });
  });

  it('calculates compound taxes correctly', () => {
    const result = calculateCompoundTax(100, [
      { name: 'GST', rate: 5 },
      { name: 'PST', rate: 8, compoundOn: 'GST' },
    ]);

    expect(result.taxAmount).toBe(13.4);
    expect(result.total).toBe(113.4);
    expect(result.taxBreakdown).toHaveLength(2);
  });

  it('covers all six core tax types plus custom through exemption checks', () => {
    const taxTypes: TaxType[] = ['sales_tax', 'vat', 'gst', 'hst', 'pst', 'qst', 'custom'];
    const exemptions: TaxExemption[] = taxTypes.map((taxType, index) => ({
      id: `ex-${index}`,
      clientId: 'client-1',
      exemptionType: 'full',
      exemptionReason: 'Government',
      taxTypes: [taxType],
      isActive: true,
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    for (const taxType of taxTypes) {
      expect(isClientTaxExempt(exemptions, 'client-1', taxType)).toBe(true);
    }
  });

  it('rejects inactive and expired exemptions', () => {
    const exemptions: TaxExemption[] = [
      {
        id: 'inactive',
        clientId: 'client-1',
        exemptionType: 'full',
        exemptionReason: 'Inactive',
        taxTypes: ['vat'],
        isActive: false,
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'expired',
        clientId: 'client-1',
        exemptionType: 'full',
        exemptionReason: 'Expired',
        taxTypes: ['vat'],
        isActive: true,
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(isClientTaxExempt(exemptions, 'client-1', 'vat')).toBe(false);
  });

  it('contains expected regional default rates', () => {
    expect(DEFAULT_TAX_RATES.US_CA.rate).toBe(7.25);
    expect(DEFAULT_TAX_RATES.CA_ON.type).toBe('hst');
    expect(DEFAULT_TAX_RATES.CA_QC.type).toBe('qst');
    expect(DEFAULT_TAX_RATES.DE.type).toBe('vat');
    expect(DEFAULT_TAX_RATES.AU.type).toBe('gst');
  });
});
