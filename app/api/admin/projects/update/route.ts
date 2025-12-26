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

function cleanString(value: any) {
  return String(value || "").trim();
}

function toISODate(value: any) {
  if (value === null) return null;
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function canManageAll(role: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager";
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

    const body = await req.json();
    const id = cleanString(body?.id);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing project id" }, { status: 400 });
    }

    const ref = adminDb.collection("projects").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    const data = snap.data() || {};

    const role = (me.role || "").toLowerCase();
    const canManage = canManageAll(role);

    if (!canManage) {
      const ownerUid = data.ownerAmUid || null;
      const createdByUid = data.createdByUid || null;
      const unassigned = !ownerUid;
      const allowed = ownerUid === me.uid || (unassigned && createdByUid === me.uid);
      if (!allowed) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const updateData: Record<string, any> = {};

    if (body?.projectName !== undefined) {
      const value = cleanString(body.projectName);
      if (!value) return NextResponse.json({ ok: false, error: "Project name is required" }, { status: 400 });
      updateData.projectName = value;
    }

    if (body?.projectType !== undefined) {
      const value = cleanString(body.projectType);
      if (!PROJECT_TYPES.includes(value)) {
        return NextResponse.json({ ok: false, error: "Invalid project type" }, { status: 400 });
      }
      updateData.projectType = value;
    }

    if (body?.stage !== undefined) {
      const value = cleanString(body.stage);
      if (!PIPELINE_STAGES.includes(value)) {
        return NextResponse.json({ ok: false, error: "Invalid pipeline stage" }, { status: 400 });
      }
      updateData.stage = value;
    }

    if (body?.priority !== undefined) {
      const value = cleanString(body.priority || "Normal");
      updateData.priority = PRIORITIES.includes(value) ? value : "Normal";
    }

    if (body?.ownerAmUid !== undefined) {
      const ownerAmUid = cleanString(body.ownerAmUid) || null;
      updateData.ownerAmUid = ownerAmUid;
      updateData.ownerAmName = ownerAmUid ? await resolveUserName(ownerAmUid) : null;
    }

    if (body?.productionUid !== undefined) {
      const productionUid = cleanString(body.productionUid) || null;
      updateData.productionUid = productionUid;
      updateData.productionName = productionUid ? await resolveUserName(productionUid) : null;
    }

    if (body?.startDate !== undefined) {
      const parsed = toISODate(body.startDate);
      if (parsed !== undefined) updateData.startDate = parsed;
    }

    if (body?.dueDate !== undefined) {
      const parsed = toISODate(body.dueDate);
      if (parsed !== undefined) updateData.dueDate = parsed;
    }

    if (body?.internalNotes !== undefined) {
      updateData.internalNotes = cleanString(body.internalNotes);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedAt = now;
    updateData.lastActivityAt = now;

    await ref.set(updateData, { merge: true });

    return NextResponse.json({ ok: true, project: { id, ...updateData } });
  } catch (err: any) {
    console.error("projects/update error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
