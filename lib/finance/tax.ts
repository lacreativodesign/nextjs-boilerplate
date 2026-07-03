export type TaxType = 'sales_tax' | 'vat' | 'gst' | 'hst' | 'pst' | 'qst' | 'custom';

export interface TaxRate {
  id: string;
  name: string;
  type: TaxType;
  rate: number;
  country: string;
  region?: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxExemption {
  id: string;
  clientId: string;
  exemptionType: 'full' | 'partial';
  exemptionReason: string;
  exemptionCertificate?: string;
  taxTypes: TaxType[];
  isActive: boolean;
  expiresAt?: Date;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxCalculation {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxBreakdown: Array<{
    name: string;
    rate: number;
    amount: number;
  }>;
}

export const DEFAULT_TAX_RATES = {
  US_CA: { name: 'California Sales Tax', rate: 7.25, type: 'sales_tax' as const },
  US_NY: { name: 'New York Sales Tax', rate: 4.0, type: 'sales_tax' as const },
  US_TX: { name: 'Texas Sales Tax', rate: 6.25, type: 'sales_tax' as const },
  US_FL: { name: 'Florida Sales Tax', rate: 6.0, type: 'sales_tax' as const },
  US_WA: { name: 'Washington Sales Tax', rate: 6.5, type: 'sales_tax' as const },

  CA_ON: { name: 'Ontario HST', rate: 13.0, type: 'hst' as const },
  CA_BC: { name: 'BC GST + PST', rate: 12.0, type: 'gst' as const },
  CA_AB: { name: 'Alberta GST', rate: 5.0, type: 'gst' as const },
  CA_QC: { name: 'Quebec GST + QST', rate: 14.975, type: 'qst' as const },

  GB: { name: 'UK VAT', rate: 20.0, type: 'vat' as const },
  DE: { name: 'Germany VAT', rate: 19.0, type: 'vat' as const },
  FR: { name: 'France VAT', rate: 20.0, type: 'vat' as const },
  ES: { name: 'Spain VAT', rate: 21.0, type: 'vat' as const },
  IT: { name: 'Italy VAT', rate: 22.0, type: 'vat' as const },
  NL: { name: 'Netherlands VAT', rate: 21.0, type: 'vat' as const },

  AU: { name: 'Australia GST', rate: 10.0, type: 'gst' as const },
  NZ: { name: 'New Zealand GST', rate: 15.0, type: 'gst' as const },
  SG: { name: 'Singapore GST', rate: 9.0, type: 'gst' as const },
  IN: { name: 'India GST', rate: 18.0, type: 'gst' as const },

  AE: { name: 'UAE VAT', rate: 5.0, type: 'vat' as const },
  SA: { name: 'Saudi Arabia VAT', rate: 15.0, type: 'vat' as const },
};

export function calculateTax(subtotal: number, taxRate: number): TaxCalculation {
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;

  return {
    subtotal,
    taxRate,
    taxAmount,
    total,
    taxBreakdown: [
      {
        name: 'Tax',
        rate: taxRate,
        amount: taxAmount,
      },
    ],
  };
}

export function calculateCompoundTax(
  subtotal: number,
  taxes: Array<{ name: string; rate: number; compoundOn?: string }>,
): TaxCalculation {
  let runningTotal = subtotal;
  const taxBreakdown: Array<{ name: string; rate: number; amount: number }> = [];
  let totalTaxAmount = 0;

  for (const tax of taxes) {
    const baseAmount = tax.compoundOn ? runningTotal : subtotal;
    const taxAmount = Math.round(baseAmount * (tax.rate / 100) * 100) / 100;

    taxBreakdown.push({
      name: tax.name,
      rate: tax.rate,
      amount: taxAmount,
    });

    totalTaxAmount += taxAmount;
    runningTotal += taxAmount;
  }

  return {
    subtotal,
    taxRate: taxes.reduce((sum, tax) => sum + tax.rate, 0),
    taxAmount: totalTaxAmount,
    total: subtotal + totalTaxAmount,
    taxBreakdown,
  };
}

export function isClientTaxExempt(
  exemptions: TaxExemption[],
  clientId: string,
  taxType: TaxType,
): boolean {
  const now = new Date();

  return exemptions.some(
    (exemption) =>
      exemption.clientId === clientId &&
      exemption.isActive &&
      exemption.taxTypes.includes(taxType) &&
      (!exemption.expiresAt || exemption.expiresAt > now),
  );
}
