export type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Void";
export type PaymentStatus = "Pending" | "Paid" | "Failed" | "Refunded";
export type PaymentMethod = "Card" | "Bank" | "Cash" | "PayPal" | "Wise" | "Other";
export type PayrollStatus = "Draft" | "Approved" | "Paid";
export type ExpenseStatus = "Recorded" | "Paid";

export type InvoiceLineItem = {
  name: string;
  qty: number;
  unitPriceUsd: number;
};

export type InvoiceRecord = {
  id: string;
  orderId: string;
  clientId: string;
  clientName: string;
  currency: "USD";
  amountSubtotalUsd: number;
  amountTaxUsd: number;
  amountTotalUsd: number;
  status: InvoiceStatus;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  lineItems: InvoiceLineItem[];
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isDeleted: boolean;
};

export type PaymentRecord = {
  id: string;
  clientId: string;
  clientName: string;
  invoiceId: string | null;
  orderId?: string | null;
  currency: "USD";
  amountUsd: number;
  method: PaymentMethod;
  status: PaymentStatus;
  notes?: string | null;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isDeleted: boolean;
};

export type PayrollRecord = {
  id: string;
  userId: string;
  userName: string;
  role: string;
  currency: "PKR";
  baseSalaryPkr: number;
  commissionPkr?: number | null;
  commissionUsd?: number | null;
  month: string;
  status: PayrollStatus;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isDeleted: boolean;
};

export type ExpenseRecord = {
  id: string;
  category: string;
  vendor: string;
  currency: "PKR";
  amountPkr: number;
  expenseDate: string | null;
  status: ExpenseStatus;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isDeleted: boolean;
};

export type FinanceEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  createdAt: string | null;
  createdByUid?: string | null;
  createdByName?: string | null;
};

export type FinanceOverview = {
  kpisUsd: {
    totalRevenueMonth: number;
    outstandingInvoices: number;
    paymentsReceivedMonth: number;
    agingBuckets: {
      bucket0to30: number;
      bucket31to60: number;
      bucket61to90: number;
      bucket90plus: number;
    };
  };
  kpisPkr: {
    payrollDueMonth: number;
    expensesMonth: number;
  };
  revenueSeries: { label: string; invoices: number; payments: number }[];
  expenseBreakdown: { label: string; value: number }[];
  recentEvents: FinanceEvent[];
};
