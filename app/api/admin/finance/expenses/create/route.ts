import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseNumber, parseString, requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
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
