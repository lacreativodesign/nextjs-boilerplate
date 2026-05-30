import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, serverTimestamp } from "../../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const body = await req.json();
    const month = String(body?.month || "").trim();
    if (!month) {
      return NextResponse.json({ ok: false, error: "Month is required." }, { status: 400 });
    }

    const existingDocs = await queryWithTenant(
      adminDb.collection("payroll").where("isDeleted", "==", false).limit(500),
      tenantId
    );
    const existingUserIds = new Set(
      existingDocs
        .map((doc) => doc.data() || {})
        .filter((row) => String(row.month || "") === month)
        .map((row) => String(row.userId || ""))
    );

    const usersDocs = await queryWithTenant(adminDb.collection("users"), tenantId);
    const batch = adminDb.batch();
    let created = 0;

    usersDocs.forEach((doc) => {
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
        tenantId,
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
  } catch (err) {
    console.error("finance/payroll run error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to run payroll.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
