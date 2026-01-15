import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseNumber, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { DEFAULT_FINANCE_SETTINGS, getFinanceSettings } from "../../admin/settings/_utils";
import { normalizeTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (String(auth.user.role || "").toLowerCase() === "finance") {
      return NextResponse.json({ ok: false, error: "Read-only access." }, { status: 403 });
    }

    const body = await req.json();
    const category = parseString(body?.category).trim();
    const vendor = parseString(body?.vendor).trim();
    const amountPkr = parseNumber(body?.amountPkr, 0);
    const expenseDate = parseString(body?.expenseDate).trim();
    const status = parseString(body?.status || "Recorded").trim();
    const notes = parseString(body?.notes).trim();

    if (!category) {
      return NextResponse.json({ ok: false, error: "Category is required." }, { status: 400 });
    }

    if (!amountPkr) {
      return NextResponse.json({ ok: false, error: "Amount is required." }, { status: 400 });
    }

    const financeSettings = await getFinanceSettings();
    const fxPkrPerUsdRaw = Number(financeSettings.fxPkrPerUsd || DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd);
    const fxPkrPerUsd = fxPkrPerUsdRaw > 0 ? fxPkrPerUsdRaw : DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd;

    const parsedExpenseDate = expenseDate ? new Date(expenseDate) : new Date();
    const expenseMonth = parsedExpenseDate.getMonth() + 1;
    const expenseYear = parsedExpenseDate.getFullYear();
    const amountUsd = fxPkrPerUsd ? amountPkr / fxPkrPerUsd : 0;

    const ref = adminDb.collection("expenses").doc();
    await ref.set({
      tenantId: normalizeTenantId(auth.user.tenantId),
      category,
      vendor: vendor || null,
      currency: "PKR",
      amountPkr,
      amountUsd,
      expenseDate: expenseDate ? new Date(expenseDate) : null,
      month: expenseMonth,
      year: expenseYear,
      status: status || "Recorded",
      notes: notes || null,
      createdByUid: auth.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    });

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Expense recorded",
          body: `${category} expense recorded for ${vendor}.`,
          type: "info",
          entityId: ref.id,
          deepLink: "/finance/reports",
          createdBy: { uid: auth.user.uid, name: actorName },
        })
      )
    );

    await createFinanceEvent({
      type: "finance.expense_recorded",
      title: "Expense recorded",
      description: `${category} expense recorded for ${vendor}.`,
      entityType: "expense",
      entityId: ref.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err: any) {
    console.error("finance/expenses create error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to create expense.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
