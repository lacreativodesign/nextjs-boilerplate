import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";

const DAY_MS = 24 * 60 * 60 * 1000;

type FinanceDoc = Record<string, any>;

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where("tenantId", "==", null));
  }
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function loadFinancialDocuments(tenantId: string) {
  const scopedTenantId = normalizeTenantId(tenantId);
  const [invoicesSnap, paymentsSnap, expensesSnap, payrollSnap, clientsSnap] = await Promise.all([
    queryWithTenant(adminDb.collection("invoices").where("isDeleted", "==", false).limit(500), scopedTenantId),
    queryWithTenant(adminDb.collection("payments").where("isDeleted", "==", false).limit(500), scopedTenantId),
    queryWithTenant(adminDb.collection("expenses").where("isDeleted", "==", false).limit(500), scopedTenantId),
    queryWithTenant(adminDb.collection("payroll").where("isDeleted", "==", false).limit(500), scopedTenantId),
    queryWithTenant(adminDb.collection("clients").where("isDeleted", "==", false).limit(500), scopedTenantId),
  ]);

  return {
    invoices: invoicesSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
    payments: paymentsSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
    expenses: expensesSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
    payroll: payrollSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
    clients: clientsSnap.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
  };
}

export function computeProfitLoss({
  payments,
  expenses,
  payroll,
  range,
  fxPkrPerUsd,
}: {
  payments: FinanceDoc[];
  expenses: FinanceDoc[];
  payroll: FinanceDoc[];
  range: { start: Date; end: Date };
  fxPkrPerUsd: number;
}) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  const revenueUsd = payments.reduce((sum, payment) => {
    if (String(payment.status || "") !== "Paid") return sum;
    const paidMs = toMillis(payment.paidAt || payment.createdAt);
    if (!paidMs || paidMs < startMs || paidMs > endMs) return sum;
    return sum + Number(payment.amountUsd || 0);
  }, 0);

  const expensePkr = expenses.reduce((sum, expense) => {
    const expenseMs = toMillis(expense.expenseDate || expense.createdAt);
    if (!expenseMs || expenseMs < startMs || expenseMs > endMs) return sum;
    return sum + Number(expense.amountPkr || 0);
  }, 0);

  const payrollPkr = payroll.reduce((sum, row) => {
    const paidMs = toMillis(row.paidAt || row.updatedAt || row.createdAt);
    if (!paidMs || paidMs < startMs || paidMs > endMs) return sum;
    return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
  }, 0);

  const expenseUsd = fxPkrPerUsd ? (expensePkr + payrollPkr) / fxPkrPerUsd : 0;
  const profitUsd = revenueUsd - expenseUsd;
  const marginPct = revenueUsd ? (profitUsd / revenueUsd) * 100 : 0;

  return {
    revenueUsd,
    expenseUsd,
    profitUsd,
    marginPct,
  };
}

export function computeCashflow({
  invoices,
  payments,
  range,
}: {
  invoices: FinanceDoc[];
  payments: FinanceDoc[];
  range: { start: Date; end: Date };
}) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const nowMs = Date.now();

  const invoicesIssuedUsd = invoices.reduce((sum, invoice) => {
    const issuedMs = toMillis(invoice.issuedAt || invoice.createdAt);
    if (!issuedMs || issuedMs < startMs || issuedMs > endMs) return sum;
    return sum + Number(invoice.amountTotalUsd || 0);
  }, 0);

  const paymentsReceivedUsd = payments.reduce((sum, payment) => {
    if (String(payment.status || "") !== "Paid") return sum;
    const paidMs = toMillis(payment.paidAt || payment.createdAt);
    if (!paidMs || paidMs < startMs || paidMs > endMs) return sum;
    return sum + Number(payment.amountUsd || 0);
  }, 0);

  const outstandingInvoices = invoices.filter((invoice) => {
    const status = String(invoice.status || "");
    if (["Paid", "Void"].includes(status)) return false;
    return true;
  });

  const outstandingBalanceUsd = outstandingInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amountTotalUsd || 0),
    0
  );

  const overdueInvoicesCount = outstandingInvoices.filter((invoice) => {
    const dueMs = toMillis(invoice.dueDate);
    return dueMs ? dueMs < nowMs : false;
  }).length;

  return {
    invoicesIssuedUsd,
    paymentsReceivedUsd,
    outstandingBalanceUsd,
    overdueInvoicesCount,
  };
}

export function computeClientProfitability({
  payments,
  expenses,
  payroll,
  clients,
  range,
  fxPkrPerUsd,
}: {
  payments: FinanceDoc[];
  expenses: FinanceDoc[];
  payroll: FinanceDoc[];
  clients: FinanceDoc[];
  range: { start: Date; end: Date };
  fxPkrPerUsd: number;
}) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  const revenueByClient = new Map<string, number>();
  payments.forEach((payment) => {
    if (String(payment.status || "") !== "Paid") return;
    const paidMs = toMillis(payment.paidAt || payment.createdAt);
    if (!paidMs || paidMs < startMs || paidMs > endMs) return;
    const clientId = String(payment.clientId || "");
    if (!clientId) return;
    revenueByClient.set(clientId, (revenueByClient.get(clientId) || 0) + Number(payment.amountUsd || 0));
  });

  const totalRevenue = Array.from(revenueByClient.values()).reduce((sum, value) => sum + value, 0);
  const expensePkr = expenses.reduce((sum, expense) => {
    const expenseMs = toMillis(expense.expenseDate || expense.createdAt);
    if (!expenseMs || expenseMs < startMs || expenseMs > endMs) return sum;
    return sum + Number(expense.amountPkr || 0);
  }, 0);

  const payrollPkr = payroll.reduce((sum, row) => {
    const paidMs = toMillis(row.paidAt || row.updatedAt || row.createdAt);
    if (!paidMs || paidMs < startMs || paidMs > endMs) return sum;
    return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
  }, 0);

  const totalExpenseUsd = fxPkrPerUsd ? (expensePkr + payrollPkr) / fxPkrPerUsd : 0;

  return Array.from(revenueByClient.entries()).map(([clientId, revenueUsd]) => {
    const client = clients.find((row) => String(row.id) === clientId);
    const clientName = String(client?.companyName || client?.name || "Client");
    const estimatedCostUsd = totalRevenue ? (totalExpenseUsd * revenueUsd) / totalRevenue : 0;
    const profitUsd = revenueUsd - estimatedCostUsd;
    const marginPct = revenueUsd ? (profitUsd / revenueUsd) * 100 : 0;
    return {
      clientId,
      clientName,
      revenueUsd,
      estimatedCostUsd,
      profitUsd,
      marginPct,
      flagLowMargin: marginPct < 20,
    };
  });
}

export function resolveDateRange({
  range,
  dateFrom,
  dateTo,
}: {
  range?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start, end: now };
  }
  if (range === "7d") {
    return { start: new Date(now.getTime() - 7 * DAY_MS), end: now };
  }
  if (range === "30d") {
    return { start: new Date(now.getTime() - 30 * DAY_MS), end: now };
  }

  const parsedFrom = dateFrom ? new Date(dateFrom) : null;
  const parsedTo = dateTo ? new Date(dateTo) : null;
  const start = parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : new Date(now.getTime() - 30 * DAY_MS);
  const end = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : now;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isFullMonthRange(range: { start: Date; end: Date }) {
  const start = range.start;
  const end = range.end;
  const startOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  return (
    start.getTime() === startOfMonth.getTime() &&
    end.getTime() === endOfMonth.getTime() &&
    start.getMonth() === end.getMonth()
  );
}
