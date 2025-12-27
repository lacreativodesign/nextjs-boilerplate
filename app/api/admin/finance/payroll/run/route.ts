import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, serverTimestamp } from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const month = String(body?.month || "").trim();
    if (!month) {
      return NextResponse.json({ ok: false, error: "Month is required." }, { status: 400 });
    }

    const existingSnap = await adminDb.collection("payroll").where("isDeleted", "==", false).limit(500).get();
    const existingUserIds = new Set(
      existingSnap.docs
        .map((doc) => doc.data() || {})
        .filter((row) => String(row.month || "") === month)
        .map((row) => String(row.userId || ""))
    );

    const usersSnap = await adminDb.collection("users").get();
    const batch = adminDb.batch();
    let created = 0;

    usersSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const salary = Number(data.salary || 0);
      if (!salary || Number.isNaN(salary)) return;
      if (existingUserIds.has(doc.id)) return;

      const ref = adminDb.collection("payroll").doc();
      batch.set(ref, {
        userId: doc.id,
        userName: data.name || data.fullName || data.displayName || "",
        role: data.role || "",
        currency: "PKR",
        baseSalaryPkr: salary,
        commissionPkr: null,
        commissionUsd: null,
        month,
        status: "Draft",
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });
      created += 1;
    });

    if (created > 0) {
      await batch.commit();
    }

    return NextResponse.json({ ok: true, created });
  } catch (err: any) {
    console.error("finance/payroll run error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to run payroll.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
