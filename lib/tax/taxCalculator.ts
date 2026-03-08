export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: "simple" | "compound";
  applies_to: "subtotal" | "subtotal_plus_other_taxes";
  enabled: boolean;
  description?: string;
}

export interface TaxCalculation {
  taxDetails: Array<{
    name: string;
    rate: number;
    amount: number;
  }>;
  totalTax: number;
  total: number;
}

export class TaxCalculator {
  private readonly taxRates: TaxRate[];

  constructor(taxRates: TaxRate[]) {
    this.taxRates = taxRates.filter((rate) => rate.enabled);
  }

  calculate(subtotal: number): TaxCalculation {
    let runningTotal = subtotal;
    const taxDetails: Array<{ name: string; rate: number; amount: number }> = [];

    const simpleTaxes = this.taxRates.filter((tax) => tax.type === "simple");
    const compoundTaxes = this.taxRates.filter((tax) => tax.type === "compound");

    for (const tax of simpleTaxes) {
      const amount = (subtotal * tax.rate) / 100;
      const roundedAmount = Number(amount.toFixed(2));
      taxDetails.push({
        name: tax.name,
        rate: tax.rate,
        amount: roundedAmount,
      });
      runningTotal += roundedAmount;
    }

    for (const tax of compoundTaxes) {
      const baseAmount = tax.applies_to === "subtotal" ? subtotal : runningTotal;
      const amount = (baseAmount * tax.rate) / 100;
      const roundedAmount = Number(amount.toFixed(2));
      taxDetails.push({
        name: tax.name,
        rate: tax.rate,
        amount: roundedAmount,
      });
      runningTotal += roundedAmount;
    }

    const totalTax = taxDetails.reduce((sum, tax) => sum + tax.amount, 0);

    return {
      taxDetails,
      totalTax: Number(totalTax.toFixed(2)),
      total: Number(runningTotal.toFixed(2)),
    };
  }

  static getUSStateTaxRate(state: string): number {
    const stateTaxRates: Record<string, number> = {
      AL: 4.0,
      AK: 0.0,
      AZ: 5.6,
      AR: 6.5,
      CA: 7.25,
      CO: 2.9,
      CT: 6.35,
      DE: 0.0,
      FL: 6.0,
      GA: 4.0,
      HI: 4.0,
      ID: 6.0,
      IL: 6.25,
      IN: 7.0,
      IA: 6.0,
      KS: 6.5,
      KY: 6.0,
      LA: 4.45,
      ME: 5.5,
      MD: 6.0,
      MA: 6.25,
      MI: 6.0,
      MN: 6.88,
      MS: 7.0,
      MO: 4.23,
      MT: 0.0,
      NE: 5.5,
      NV: 6.85,
      NH: 0.0,
      NJ: 6.63,
      NM: 5.13,
      NY: 4.0,
      NC: 4.75,
      ND: 5.0,
      OH: 5.75,
      OK: 4.5,
      OR: 0.0,
      PA: 6.0,
      RI: 7.0,
      SC: 6.0,
      SD: 4.5,
      TN: 7.0,
      TX: 6.25,
      UT: 6.1,
      VT: 6.0,
      VA: 5.3,
      WA: 6.5,
      WV: 6.0,
      WI: 5.0,
      WY: 4.0,
    };

    return stateTaxRates[String(state || "").toUpperCase()] || 0;
  }
}
