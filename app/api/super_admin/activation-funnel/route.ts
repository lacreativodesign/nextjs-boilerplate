import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = [
  { id: "workspace", title: "Workspace" },
  { id: "lead", title: "First lead" },
  { id: "deal", title: "First deal" },
  { id: "invoice", title: "First invoice" },
  { id: "paid", title: "First payment" },
  { id: "project", title: "First project" },
  { id: "client", title: "First client" },
] as const;

async function exists(
  collection: string,
  tenantId: string,
  extra?: { field: string; value: unknown }
): Promise<boolean> {
  try {
    let q = adminDb.collection(collection).where("tenantId", "==", tenantId);
    if (extra) q = q.where(extra.field, "==", extra.value);
    const snap = await q.limit(1).get();
    return !snap.empty;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const tenantsSnap = await adminDb.collection("tenants").limit(200).get();

    const tenants: Array<{
      id: string;
      name: string;
      createdAt: string | null;
      milestones: Record<string, boolean>;
      progress: number;
    }> = [];

    for (const doc of tenantsSnap.docs) {
      const data = doc.data() as any;
      const tenantId = doc.id;
      const [lead, deal, invoice, paid, project, client] = await Promise.all([
        exists("leads", tenantId),
        exists("deals", tenantId),
        exists("invoices", tenantId),
        exists("invoices", tenantId, { field: "status", value: "paid" }),
        exists("projects", tenantId),
        exists("clients", tenantId),
      ]);
      const milestones: Record<string, boolean> = {
        workspace: true,
        lead,
        deal,
        invoice,
        paid,
        project,
        client,
      };
      const done = STAGES.filter((s) => milestones[s.id]).length;
      tenants.push({
        id: tenantId,
        name: data?.name || tenantId,
        createdAt: data?.createdAt || null,
        milestones,
        progress: Math.round((done / STAGES.length) * 100),
      });
    }

    const totalTenants = tenants.length;
    const stages = STAGES.map((s) => {
      const count = tenants.filter((t) => t.milestones[s.id]).length;
      return {
        id: s.id,
        title: s.title,
        count,
        pct: totalTenants ? Math.round((count / totalTenants) * 100) : 0,
      };
    });

    tenants.sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

    return NextResponse.json({ totalTenants, stages, tenants });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to compute activation funnel.";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}
