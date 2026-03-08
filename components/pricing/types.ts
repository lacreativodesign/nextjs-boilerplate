export type BillingCycle = "monthly" | "annual";

export type CurrencyCode = "USD" | "EUR" | "GBP";

export interface PricingPlan {
  name: "Starter" | "Pro" | "Enterprise";
  price: {
    monthly: number;
    annual: number;
  };
  description: string;
  popular?: boolean;
  features: string[];
  limits: string;
  cta: string;
}

export interface CurrencyConfig {
  symbol: string;
  rateFromUSD: number;
}
