import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseNumber, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const category = parseString(body?.category).trim();
    const amountPkr = parseNumber(body?.amountPkr ?? body?.amount, 0);
    const incurredAt = parseString(body?.incurredAt ?? body?.expenseDate).trim();
    const note = parseString(body?.note ?? body?.notes).trim();

    const allowedCategories = new Set(["salary", "tools", "operations", "marketing", "other"]);
    if (!category) {
      return NextResponse.json({ ok: false, error: "Category is required." }, { status: 400 });
    }
    if (!allowedCategories.has(category)) {
      return NextResponse.json({ ok: false, error: "Invalid expense category." }, { status: 400 });
    }

    if (!amountPkr) {
      return NextResponse.json({ ok: false, error: "Amount is required." }, { status: 400 });
    }

    const ref = adminDb.collection("expenses").doc();
    const payload = {
      id: ref.id,
      tenantId: auth.tenantId,
      category,
      amount: amountPkr,
      amountPkr,
      currency: "PKR",
      note: note || null,
      notes: note || null,
      incurredAt: incurredAt ? new Date(incurredAt) : null,
      expenseDate: incurredAt ? new Date(incurredAt) : null,
      createdBy: { uid: auth.user.uid, role: auth.user.role },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };
    await ref.set(payload);

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"]);
    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Expense recorded",
          body: `${category} expense recorded.`,
          type: "info",
          entityId: ref.id,
          deepLink: "/finance/reports",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.tenantId,
          roleTarget: "finance",
        })
      )
    );

    await createFinanceEvent({
      type: "finance.expense_recorded",
      title: "Expense recorded",
      description: `${category} expense recorded.`,
      entityType: "expense",
      entityId: ref.id,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: { tenantId: auth.tenantId },
    });

    const auditAfter = {
      ...payload,
      createdAt: new Date().toISOString(),
    };

    await logEvent({
      tenantId: auth.tenantId,
      type: "finance.expense_added",
      title: "Expense added",
      description: `${category} expense added.`,
      entityType: "expense",
      entityId: ref.id,
      actor: { uid: auth.user.uid, name: actorName },
      metadata: { before: null, after: auditAfter },
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
