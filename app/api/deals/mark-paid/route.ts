import crypto from "crypto";
import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logEvent } from "@/lib/audit";
import { createNotifications, getUserIdsByRoles } from "@/lib/notifications";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { Permission, hasPermission } from "../../../lib/permissions";
import { getCurrentUser } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanString(value: any) {
  return String(value ?? "").trim();
}

function isPaidStatus(value: any) {
  return cleanString(value).toLowerCase() === "paid";
}

function formatOrderId(seq: number) {
  return `LC-${String(seq).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  let createdAuthUid: string | null = null;
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(me.role, Permission.MarkPaymentPaid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dealId = cleanString(body?.dealId || body?.id);
    if (!dealId) {
      return NextResponse.json({ ok: false, error: "Missing deal id." }, { status: 400 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const dealRef = adminDb.collection("deals").doc(dealId);
    const dealSnap = await dealRef.get();
    if (!dealSnap.exists) {
      return NextResponse.json({ ok: false, error: "Deal not found." }, { status: 404 });
    }

    const dealData = dealSnap.data() || {};
    if (docTenantId(dealData) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const initialProjectId = cleanString(dealData.projectId || "");
    if (isPaidStatus(dealData.paymentStatus) && (dealData.projectCreated || initialProjectId)) {
      return NextResponse.json({ ok: true, status: "already_paid", projectId: initialProjectId || null });
    }

    const clientId = cleanString(dealData.clientId || "");
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Deal is missing client id." }, { status: 400 });
    }

    const clientRef = adminDb.collection("clients").doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (docTenantId(clientData) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const email = cleanString(
      clientData.primaryContactEmail || clientData.primaryContactEmailLower || clientData.email || ""
    ).toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Client primary contact email is required." }, { status: 400 });
    }

    let portalUserUid = cleanString(clientData.portalUserUid || "");
    if (portalUserUid) {
      const existingUser = await adminAuth.getUser(portalUserUid).catch(() => null);
      if (!existingUser) {
        portalUserUid = "";
      }
    }

    if (!portalUserUid) {
      const existingByEmail = await adminAuth.getUserByEmail(email).catch(() => null);
      if (existingByEmail) {
        portalUserUid = existingByEmail.uid;
      } else {
        const created = await adminAuth.createUser({
          email,
          password: crypto.randomBytes(16).toString("hex"),
          displayName: cleanString(clientData.primaryContactName || clientData.companyName || email),
        });
        portalUserUid = created.uid;
        createdAuthUid = created.uid;
      }
    }

    let projectId: string | null = null;
    let projectCreated = false;
    let didUpdate = false;
    let usedOrderId = "";
    let projectName = cleanString(dealData.dealName || dealData.leadName || "New Project");
    let alreadyPaid = false;

    await adminDb.runTransaction(async (tx) => {
      const dealTxSnap = await tx.get(dealRef);
      if (!dealTxSnap.exists) {
        throw new Error("Deal not found");
      }

      const data = dealTxSnap.data() || {};
      if (docTenantId(data) !== tenantId) {
        throw new Error("Forbidden");
      }

      const paymentAlreadyPaid = isPaidStatus(data.paymentStatus);
      const existingProjectId = cleanString(data.projectId || "");
      const existingProjectCreated = Boolean(data.projectCreated);

      if (paymentAlreadyPaid && (existingProjectCreated || existingProjectId)) {
        alreadyPaid = true;
        projectId = existingProjectId || null;
        projectCreated = existingProjectCreated || Boolean(existingProjectId);
        if (!projectId) {
          const projectQuery = adminDb.collection("projects").where("dealId", "==", dealId).limit(1);
          const projectSnap = await tx.get(projectQuery);
          if (!projectSnap.empty) {
            projectId = projectSnap.docs[0].id;
          }
        }
        return;
      }

      const clientTxSnap = await tx.get(clientRef);
      if (!clientTxSnap.exists) {
        throw new Error("Client not found");
      }
      const clientTxData = clientTxSnap.data() || {};
      if (docTenantId(clientTxData) !== tenantId) {
        throw new Error("Forbidden");
      }

      projectName = cleanString(data.dealName || data.leadName || projectName || "New Project");
      const clientName = cleanString(clientTxData.companyName || data.clientName || data.leadName || "Client");
      const assignedAmUid = cleanString(data.assignedAMId || data.assignedAmId || data.ownerId || "") || null;
      const assignedAmName = cleanString(data.assignedAMName || data.assignedAmName || data.ownerName || "") || null;

      let resolvedProjectId = existingProjectId;
      if (!resolvedProjectId) {
        const projectQuery = adminDb.collection("projects").where("dealId", "==", dealId).limit(1);
        const projectSnap = await tx.get(projectQuery);
        if (!projectSnap.empty) {
          resolvedProjectId = projectSnap.docs[0].id;
        }
      }

      if (resolvedProjectId) {
        projectId = resolvedProjectId;
        projectCreated = true;
      } else {
        const projectRef = adminDb.collection("projects").doc();
        projectId = projectRef.id;
        projectCreated = true;
        const existingOrderId = cleanString(data.orderId || clientTxData.orderId || "");
        if (existingOrderId) {
          usedOrderId = existingOrderId;
        } else {
          const counterRef = adminDb.collection("Order IDs").doc("counter");
          const counterSnap = await tx.get(counterRef);
          const current = Number((counterSnap.data() || {}).seq ?? 0);
          const next = current + 1;
          usedOrderId = formatOrderId(next);
          tx.set(counterRef, { seq: next }, { merge: true });
        }

        tx.set(projectRef, {
          tenantId,
          dealId,
          clientId,
          orderId: usedOrderId || null,
          projectName,
          title: projectName,
          clientName,
          status: "active",
          stage: "Kickoff",
          ownerAmUid: assignedAmUid,
          ownerAmName: assignedAmName,
          assignedAmUid: assignedAmUid,
          assignedProdUid: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          isDeleted: false,
        });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const dealUpdates: Record<string, any> = {
        paymentStatus: "Paid",
        paidAt: now,
        projectCreated: true,
        projectId: projectId || null,
        isLocked: true,
        lockedAt: now,
        lockedByUid: me.uid,
        lockedByName: cleanString(me.name || me.fullName || ""),
        updatedAt: now,
        tenantId,
      };

      if (usedOrderId && !data.orderId) {
        dealUpdates.orderId = usedOrderId;
      }

      tx.set(dealRef, dealUpdates, { merge: true });

      const clientUpdates: Record<string, any> = {
        portalUserUid: portalUserUid || null,
        accountStatus: "ACTIVE",
        accountActivatedAt: now,
        updatedAt: now,
        tenantId,
      };

      if (usedOrderId && !clientTxData.orderId) {
        clientUpdates.orderId = usedOrderId;
      }

      tx.set(clientRef, clientUpdates, { merge: true });

      if (portalUserUid) {
        tx.set(
          adminDb.collection("users").doc(portalUserUid),
          {
            uid: portalUserUid,
            role: "client",
            status: "active",
            clientId,
            email,
            tenantId,
            updatedAt: now,
            createdAt: now,
          },
          { merge: true }
        );
      }

      didUpdate = true;
    });

    if (!didUpdate && createdAuthUid) {
      await adminAuth.deleteUser(createdAuthUid).catch(() => null);
      createdAuthUid = null;
    }

    if (!didUpdate) {
      return NextResponse.json({ ok: true, status: "already_paid", projectId: projectId || null });
    }

    const actorName = cleanString(me.name || me.fullName || "");

    await logEvent({
      tenantId,
      type: "deal_paid",
      title: "Deal marked paid",
      description: `${projectName || "Deal"} marked paid and project created.`,
      entityType: "deal",
      entityId: dealId,
      actor: { uid: me.uid, name: actorName },
      metadata: {
        dealId,
        projectId,
        tenantId,
      },
    });

    const roleIds = await getUserIdsByRoles(["admin", "super_admin", "production_manager", "finance"], tenantId);
    const assignedAmId = cleanString(dealData.assignedAMId || dealData.assignedAmId || dealData.ownerId || "");
    const recipients = [
      ...roleIds.map((uid) => ({ uid, tenantId })),
      ...(assignedAmId ? [{ uid: assignedAmId, tenantId }] : []),
    ];

    await createNotifications({
      recipients,
      tenantId,
      type: "deal_paid",
      title: "Deal marked paid",
      message: `${projectName || "Deal"} marked paid.`,
      entityType: "deal",
      entityId: dealId,
      deepLink: "/admin/sales/deals",
      createdBy: { uid: me.uid, name: actorName },
    });

    await createNotifications({
      recipients,
      tenantId,
      type: "project_created",
      title: "Project created",
      message: `${projectName || "Project"} created from paid deal.`,
      entityType: "project",
      entityId: projectId || null,
      deepLink: "/projects",
      createdBy: { uid: me.uid, name: actorName },
    });

    return NextResponse.json({
      ok: true,
      status: alreadyPaid ? "already_paid" : "marked_paid",
      projectId: projectId || null,
    });
  } catch (err: any) {
    if (createdAuthUid) {
      await adminAuth.deleteUser(createdAuthUid).catch(() => null);
    }
    console.error("mark-paid error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unable to mark deal paid." }, { status: 500 });
  }
}
