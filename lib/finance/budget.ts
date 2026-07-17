export type BudgetType = 'revenue' | 'expense' | 'project' | 'department' | 'custom';
export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly';
export type BudgetStatus = 'draft' | 'active' | 'closed' | 'revised';

export interface Budget {
  id: string;
  name: string;
  type: BudgetType;
  period: BudgetPeriod;
  startDate: Date;
  endDate: Date;
  status: BudgetStatus;
  currency: string;
  totalAmount: number;
  categories: BudgetCategory[];
  description?: string;
  ownerId: string;
  ownerName: string;
  departmentId?: string;
  projectId?: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetCategory {
  id: string;
  name: string;
  description?: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentage: number;
  subcategories?: BudgetSubcategory[];
}

export interface BudgetSubcategory {
  id: string;
  name: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
}

export interface BudgetVariance {
  budgetId: string;
  categoryId?: string;
  allocatedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  status: 'under' | 'over' | 'on-track';
}

export interface BudgetActual {
  budgetId: string;
  categoryId: string;
  amount: number;
  description: string;
  date: Date;
  invoiceId?: string;
  expenseId?: string;
  reference?: string;
  tenantId: string;
  createdAt: Date;
}

export function calculateVariance(
  allocated: number,
  actual: number,
): { variance: number; variancePercentage: number; status: 'under' | 'over' | 'on-track' } {
  const variance = allocated - actual;
  const variancePercentage = allocated > 0 ? (variance / allocated) * 100 : 0;

  let status: 'under' | 'over' | 'on-track';

  if (Math.abs(variancePercentage) <= 5) {
    status = 'on-track';
  } else if (variance > 0) {
    status = 'under';
  } else {
    status = 'over';
  }

  return {
    variance: Math.round(variance * 100) / 100,
    variancePercentage: Math.round(variancePercentage * 100) / 100,
    status,
  };
}

export function calculateUtilization(allocated: number, spent: number): number {
  if (allocated === 0) return 0;
  return Math.round((spent / allocated) * 10000) / 100;
}

export function getBudgetPeriodDates(
  period: BudgetPeriod,
  year: number,
  quarter?: number,
  month?: number,
): { startDate: Date; endDate: Date } {
  let startDate: Date;
  let endDate: Date;

  // QUAL-02: build all boundaries in UTC so a budget period is the same instant regardless of the
  // server or test timezone. Local-time construction (new Date(year, month, ...)) shifted the
  // ISO boundary by the offset (e.g. Asia/Karachi turned 2025-02-01 into 2025-01-31T19:00Z),
  // which corrupted period math and failed finance tests outside UTC.
  switch (period) {
    case 'yearly':
      startDate = new Date(Date.UTC(year, 0, 1));
      endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
      break;

    case 'quarterly':
      if (!quarter || quarter < 1 || quarter > 4) {
        throw new Error('Invalid quarter');
      }
      startDate = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      endDate = new Date(Date.UTC(year, (quarter - 1) * 3 + 3, 0, 23, 59, 59));
      break;

    case 'monthly':
      if (!month || month < 1 || month > 12) {
        throw new Error('Invalid month');
      }
      startDate = new Date(Date.UTC(year, month - 1, 1));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      break;

    default:
      throw new Error('Invalid budget period');
  }

  return { startDate, endDate };
}

export function isBudgetActive(budget: Budget): boolean {
  const now = new Date();
  return budget.status === 'active' && now >= budget.startDate && now <= budget.endDate;
}
