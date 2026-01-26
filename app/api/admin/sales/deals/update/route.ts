import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  arrayUnion,
  createSalesEvent,
  parseNumber,
  parseString,
  queueSalesEmail,
  queueSalesNotification,
  requireAdmin,
  serverTimestamp,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing deal id." }, { status: 400 });
    }

    const dealRef = adminDb.collection("deals").doc(id);
    let closedWonTriggered = false;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(dealRef);
      if (!snap.exists) {
        throw new Error("Deal not found");
      }
      const data = snap.data() || {};
      const prevStage = parseString(data.stage, "New");
      const nextStage = payload.stage !== undefined ? parseString(payload.stage, prevStage) : prevStage;
      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      if (payload.dealName !== undefined) updates.dealName = parseString(payload.dealName, "");
      if (payload.clientName !== undefined) updates.clientName = parseString(payload.clientName, "");
      if (payload.valueUsd !== undefined) updates.valueUsd = parseNumber(payload.valueUsd, 0);
      if (payload.probability !== undefined) updates.probability = parseNumber(payload.probability, 0);
      if (payload.ownerId !== undefined) updates.ownerId = parseString(payload.ownerId, "") || null;
      if (payload.ownerName !== undefined) updates.ownerName = parseString(payload.ownerName, "") || null;
      if (payload.expectedCloseDate !== undefined) {
        updates.expectedCloseDate = payload.expectedCloseDate ? new Date(payload.expectedCloseDate) : null;
      }

      if (nextStage !== prevStage) {
        updates.stage = nextStage;
        updates.stageHistory = arrayUnion({
          from: prevStage,
          to: nextStage,
          changedAt: serverTimestamp(),
          changedByUid: auth.user.uid,
          changedByName: auth.user.name || auth.user.fullName || "",
        });
      }

      const shouldProcessClosedWon = nextStage === "Closed Won" && !data.closedWonProcessed;
      if (shouldProcessClosedWon) {
        closedWonTriggered = true;
        const clientName =
          parseString(payload.clientName, "") || parseString(data.clientName, "") || parseString(data.leadName, "") || "New Client";
        let clientId = data.clientId || null;
        if (!clientId) {
          const clientRef = adminDb.collection("clients").doc();
          clientId = clientRef.id;
          tx.set(clientRef, {
            companyName: clientName,
            ownerAmUid: updates.ownerId || data.ownerId || null,
            ownerAmName: updates.ownerName || data.ownerName || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false,
          });
        }

        let projectId = data.projectId || null;
        if (!projectId) {
          const projectRef = adminDb.collection("projects").doc();
          projectId = projectRef.id;
          tx.set(projectRef, {
            projectName: updates.dealName || data.dealName || "New Project",
            clientId,
            clientName,
            stage: "Inquiry",
            ownerAmUid: updates.ownerId || data.ownerId || null,
            ownerAmName: updates.ownerName || data.ownerName || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false,
          });
        }

        let invoiceId = data.invoiceId || null;
        if (!invoiceId) {
          const invoiceRef = adminDb.collection("invoices").doc();
          invoiceId = invoiceRef.id;
          tx.set(invoiceRef, {
            orderId: `DEAL-${id}`,
            clientId,
            clientName,
            currency: "USD",
            amountSubtotalUsd: parseNumber(payload.valueUsd, Number(data.valueUsd || 0)),
            amountTaxUsd: 0,
            amountTotalUsd: parseNumber(payload.valueUsd, Number(data.valueUsd || 0)),
            status: "draft",
            totalPaid: 0,
            balanceDue: parseNumber(payload.valueUsd, Number(data.valueUsd || 0)),
            dueDate: null,
            issuedAt: serverTimestamp(),
            notes: "Auto-generated from Closed Won deal.",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false,
          });
        }

        updates.clientId = clientId;
        updates.projectId = projectId;
        updates.invoiceId = invoiceId;
        updates.closedWonProcessed = true;
        updates.closedWonAt = serverTimestamp();
      }

      tx.set(dealRef, updates, { merge: true });
    });

    await createSalesEvent({
      type: closedWonTriggered ? "deal_closed_won" : "deal_updated",
      title: closedWonTriggered ? "Deal closed won" : "Deal updated",
      description: closedWonTriggered ? `Deal ${id} marked Closed Won` : `Deal ${id} updated`,
      entityType: "deal",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || "",
    });

    if (closedWonTriggered) {
      await queueSalesNotification({
        title: "Deal Closed Won",
        body: `Deal ${id} closed won. Project and finance flow created.`,
        userId: auth.user.uid,
        metadata: { dealId: id },
      });

      await queueSalesEmail({
        to: auth.user.email || "",
        template: "deal_closed_won",
        subject: "Deal Closed Won",
        data: { dealId: id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales deals update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update deal." }, { status: 500 });
  }
}
