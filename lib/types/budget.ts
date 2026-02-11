export interface Budget {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  fiscalYear: number;
  currency: string;
  categories: BudgetCategory[];
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  type: "revenue" | "expense";
  monthlyBudgets: MonthlyBudget[];
  totalBudget: number;
  totalActual: number;
  variance: number;
  variancePercentage: number;
}

export interface MonthlyBudget {
  month: number;
  budgeted: number;
  actual: number;
  variance: number;
}

export type YearComparison = {
  currentYear: number;
  previousYear: number;
  currentTotalBudget: number;
  previousTotalBudget: number;
  changeAmount: number;
  changePercentage: number;
};
