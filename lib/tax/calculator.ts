export type TaxRate = {
  id: string;
  name: string;
  rate: number;
  inclusive: boolean;
};

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
};

export type TaxCalculationResult = {
  subtotal: number;
  taxAmount: number;
  total: number;
  effectiveRate: number;
  breakdown: Array<{
    taxRateId: string;
    taxRateName: string;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
  }>;
};

const roundMoney = (value: number) => parseFloat(value.toFixed(2));

export function calculateLineItemTotal(lineItem: LineItem): number {
  const quantity = Number(lineItem.quantity || 0);
  const unitPrice = Number(lineItem.unitPrice || 0);
  return roundMoney(quantity * unitPrice);
}

export function formatTaxRate(rate: number): string {
  return `${parseFloat(Number(rate || 0).toFixed(2))}%`;
}

export function calculateTax(
  lineItems: LineItem[],
  taxRates: TaxRate[],
  options?: { roundToTwoDecimals?: boolean },
): TaxCalculationResult {
  const round = options?.roundToTwoDecimals !== false;

  const subtotalRaw = lineItems.reduce((sum, item) => {
    if (item.taxable === false) return sum;
    return sum + Number(item.quantity || 0) * Number(item.unitPrice || 0);
  }, 0);

  const breakdownRaw = taxRates.map((taxRate) => {
    const rate = Number(taxRate.rate || 0);
    const taxableAmount = subtotalRaw;
    const taxAmount = taxRate.inclusive
      ? taxableAmount - taxableAmount / (1 + rate / 100)
      : taxableAmount * (rate / 100);

    return {
      taxRateId: taxRate.id,
      taxRateName: taxRate.name,
      rate,
      taxableAmount,
      taxAmount,
      inclusive: taxRate.inclusive,
    };
  });

  const taxAmountRaw = breakdownRaw.reduce((sum, item) => sum + item.taxAmount, 0);
  const hasExclusive = breakdownRaw.some((item) => !item.inclusive);
  const totalRaw = hasExclusive ? subtotalRaw + taxAmountRaw : subtotalRaw;
  const effectiveRateRaw = subtotalRaw > 0 ? (taxAmountRaw / subtotalRaw) * 100 : 0;

  if (!round) {
    return {
      subtotal: subtotalRaw,
      taxAmount: taxAmountRaw,
      total: totalRaw,
      effectiveRate: effectiveRateRaw,
      breakdown: breakdownRaw.map(({ inclusive: _inclusive, ...item }) => item),
    };
  }

  return {
    subtotal: roundMoney(subtotalRaw),
    taxAmount: roundMoney(taxAmountRaw),
    total: roundMoney(totalRaw),
    effectiveRate: roundMoney(effectiveRateRaw),
    breakdown: breakdownRaw.map(({ inclusive: _inclusive, ...item }) => ({
      ...item,
      taxableAmount: roundMoney(item.taxableAmount),
      taxAmount: roundMoney(item.taxAmount),
    })),
  };
}
