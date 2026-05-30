import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const tenantId = "bizosto-demo";

    const [clients, leads, invoices, projects, productionJobs, employees] = await Promise.all([
      adminDb.collection("clients").where("tenantId", "==", tenantId).count().get(),
      adminDb.collection("leads").where("tenantId", "==", tenantId).count().get(),
      adminDb.collection("invoices").where("tenantId", "==", tenantId).count().get(),
      adminDb.collection("projects").where("tenantId", "==", tenantId).count().get(),
      adminDb.collection("production_jobs").where("tenantId", "==", tenantId).count().get(),
      adminDb.collection("employees").where("tenantId", "==", tenantId).count().get(),
    ]);

    return NextResponse.json({
      ok: true,
      counts: {
        clients: clients.data().count,
        leads: leads.data().count,
        invoices: invoices.data().count,
        projects: projects.data().count,
        productionJobs: productionJobs.data().count,
        employees: employees.data().count,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to load demo status" }, { status: 500 });
  }
}
