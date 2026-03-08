export type InvoiceStatusToken = "draft" | "issued" | "partially_paid" | "paid" | "void";
export type PaymentStatusToken = "pending" | "succeeded" | "failed" | "refunded";

export function parseInvoiceStatus(input: unknown): InvoiceStatusToken | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "draft") return "draft";
  if (raw === "issued" || raw === "issue" || raw === "sent" || raw === "send" || raw === "overdue") return "issued";
  if (
    raw === "partially_paid" ||
    raw === "partial_paid" ||
    raw === "partially paid" ||
    raw === "partial" ||
    raw === "partial paid"
  ) {
    return "partially_paid";
  }
  if (raw === "paid") return "paid";
  if (raw === "void" || raw === "voided") return "void";
  if (raw.includes("partial")) return "partially_paid";
  if (raw.includes("paid")) return "paid";
  if (raw.includes("void")) return "void";
  if (raw.includes("sent") || raw.includes("issue") || raw.includes("overdue")) return "issued";
  return null;
}

export function normalizeInvoiceStatus(input: unknown): InvoiceStatusToken {
  return parseInvoiceStatus(input) ?? "draft";
}

export function parsePaymentStatus(input: unknown): PaymentStatusToken | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "pending") return "pending";
  if (raw === "succeeded" || raw === "success" || raw === "paid") return "succeeded";
  if (raw === "failed" || raw === "fail") return "failed";
  if (raw === "refunded" || raw === "refund") return "refunded";
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("fail")) return "failed";
  if (raw.includes("paid") || raw.includes("success")) return "succeeded";
  return null;
}

export function normalizePaymentStatus(input: unknown): PaymentStatusToken {
  return parsePaymentStatus(input) ?? "pending";
}

export function computeInvoiceStatus({
  currentStatus,
  totalPaid,
  totalAmount,
}: {
  currentStatus: unknown;
  totalPaid: number;
  totalAmount: number;
}): InvoiceStatusToken {
  const normalized = normalizeInvoiceStatus(currentStatus);
  if (normalized === "void") return "void";
  const safeTotal = Number.isFinite(totalAmount) ? Math.max(0, totalAmount) : 0;
  const safePaid = Number.isFinite(totalPaid) ? Math.max(0, totalPaid) : 0;
  if (safePaid >= safeTotal) return "paid";
  if (safePaid > 0 && safePaid < safeTotal) return "partially_paid";
  return normalized === "issued" ? "issued" : "draft";
}

export function computeBalanceDue(totalAmount: number, totalPaid: number) {
  const safeTotal = Number.isFinite(totalAmount) ? Math.max(0, totalAmount) : 0;
  const safePaid = Number.isFinite(totalPaid) ? Math.max(0, totalPaid) : 0;
  return Math.max(0, safeTotal - safePaid);
}

export function toInvoiceStatusLabel(status: unknown) {
  const normalized = normalizeInvoiceStatus(status);
  if (normalized === "draft") return "Draft";
  if (normalized === "issued") return "Sent";
  if (normalized === "partially_paid") return "Partially Paid";
  if (normalized === "paid") return "Paid";
  if (normalized === "void") return "Void";
  return "Draft";
}

export function toPaymentStatusLabel(status: unknown) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === "pending") return "Pending";
  if (normalized === "succeeded") return "Paid";
  if (normalized === "failed") return "Failed";
  if (normalized === "refunded") return "Refunded";
  return "Pending";
}
