import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const runtime = "nodejs";

const PROJECT_TYPES = ["Website", "Branding", "SEO", "Social", "Video", "Other"];
const PIPELINE_STAGES = [
  "Inquiry",
  "Deposit",
  "Kickoff",
  "Draft",
  "Review",
  "Revisions",
  "Final",
  "Delivered",
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function canCreateProject(role: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager" || r === "account_manager";
}

function cleanString(value: any) {
  return String(value || "").trim();
}

function toISODate(value: any) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function resolveUserName(uid?: string | null) {
  const cleanUid = cleanString(uid);
  if (!cleanUid) return null;
  const doc = await adminDb.collection("users").doc(cleanUid).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return (data.name || data.fullName || data.displayName || "").toString().trim() || null;
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!canCreateProject(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const projectName = cleanString(body?.projectName);
    const clientId = cleanString(body?.clientId);
    const projectType = cleanString(body?.projectType);
    const stage = cleanString(body?.stage || "Inquiry");

    if (!projectName) {
      return NextResponse.json({ ok: false, error: "Project name is required" }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Client is required" }, { status: 400 });
    }
    if (!PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ ok: false, error: "Invalid project type" }, { status: 400 });
    }
    if (!PIPELINE_STAGES.includes(stage)) {
      return NextResponse.json({ ok: false, error: "Invalid pipeline stage" }, { status: 400 });
    }

    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const clientData = clientSnap.data() || {};
    if (clientData.deletedAt) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const priorityRaw = cleanString(body?.priority || "Normal");
    const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : "Normal";

    const ownerAmUid = cleanString(body?.ownerAmUid) || null;
    const productionUid = cleanString(body?.productionUid) || null;

    const [ownerAmName, productionName] = await Promise.all([
      resolveUserName(ownerAmUid),
      resolveUserName(productionUid),
    ]);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = adminDb.collection("projects").doc();

    const payload = {
      projectName,
      clientId,
      clientName: cleanString(clientData.companyName || clientData.name || ""),
      projectType,
      stage,
      priority,
      health: null,
      createdByUid: me.uid,
      createdByName: cleanString(me.name || me.fullName || me.displayName || ""),
      ownerAmUid,
      ownerAmName: ownerAmName || null,
      productionUid,
      productionName: productionName || null,
      startDate: toISODate(body?.startDate),
      dueDate: toISODate(body?.dueDate),
      totalPaidUsd: Number(body?.totalPaidUsd || 0),
      outstandingUsd: Number(body?.outstandingUsd || 0),
      internalNotes: cleanString(body?.internalNotes),
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };

    await ref.set(payload, { merge: true });

    return NextResponse.json({
      ok: true,
      project: {
        id: ref.id,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("projects/create error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
