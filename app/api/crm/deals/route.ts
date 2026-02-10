import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireCrmUser, toIso } from "@/lib/crm";
import { DealService } from "@/lib/crm/deal-service";

export const dynamic = "force-dynamic";

const createDealSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  customerId: z.string(),
  customerName: z.string(),
  value: z.number().min(0),
  currency: z.string().default("USD"),
  pipelineId: z.string(),
  stage: z.string(),
  expectedCloseDate: z.string(),
  source: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmUser();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data = createDealSchema.parse(body);

    const pipelineDoc = await adminDb.collection("pipelines").doc(data.pipelineId).get();
    if (!pipelineDoc.exists) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const pipelineData = pipelineDoc.data() as { tenantId?: string; name?: string; stages?: Array<{ id: string; name: string; order: number; probability: number }> };
    if (pipelineData.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const stage = pipelineData.stages?.find((entry) => entry.id === data.stage);
    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    const dealId = await DealService.createDeal({
      tenantId: auth.tenantId,
      ...data,
      pipelineName: pipelineData.name || "Default Pipeline",
      stageName: stage.name,
      stageOrder: stage.order,
      probability: stage.probability,
      ownerId: auth.user.uid,
      ownerName: auth.user.name || auth.user.email || "Unknown",
      expectedCloseDate: new Date(data.expectedCloseDate),
    });

    return NextResponse.json({ dealId });
  } catch (error) {
    console.error("Error creating deal:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create deal" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const assignedSalesId = searchParams.get("assignedSalesId");

  const snap = await adminDb.collection("deals").where("tenantId", "==", auth.tenantId).orderBy("updatedAt", "desc").limit(500).get();

  const deals = snap.docs
    .filter((doc) => {
      const data = doc.data();
      const owner = String(data.ownerId || data.assignedSalesId || "");
      if (auth.user.role === "sales" && owner !== auth.user.uid) return false;
      if (stage && String(data.stage || "") !== stage) return false;
      if (assignedSalesId && owner !== assignedSalesId) return false;
      return true;
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        leadId: String(data.leadId || data.customerId || ""),
        title: String(data.title || data.name || ""),
        valueUSD: Number(data.valueUSD || data.value || 0),
        stage: String(data.stage || "new"),
        discountPercent: Number(data.discountPercent || 0),
        discountApproved: Boolean(data.discountApproved),
        assignedSalesId: String(data.assignedSalesId || data.ownerId || ""),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

  return NextResponse.json({ ok: true, deals });
}
