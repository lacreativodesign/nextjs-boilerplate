import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, parseNumber, parseString, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const category = parseString(body?.category).trim();
    const vendor = parseString(body?.vendor).trim();
    const amountPkr = parseNumber(body?.amountPkr, 0);
    const expenseDate = parseString(body?.expenseDate).trim();
    const status = parseString(body?.status || "Recorded").trim();
    const notes = parseString(body?.notes).trim();

    if (!category || !vendor) {
      return NextResponse.json({ ok: false, error: "Category and vendor are required." }, { status: 400 });
    }

    if (!amountPkr) {
      return NextResponse.json({ ok: false, error: "Amount is required." }, { status: 400 });
    }

    const ref = adminDb.collection("expenses").doc();
    await ref.set({
      category,
      vendor,
      currency: "PKR",
      amountPkr,
      expenseDate: expenseDate ? new Date(expenseDate) : null,
      status: status || "Recorded",
      notes: notes || null,
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
