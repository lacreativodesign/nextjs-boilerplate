import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { getAmUser, isOwnedByAm } from "../../_utils";

export const runtime = "nodejs";

const FILE_CATEGORIES = ["Draft", "Revision", "Final", "Asset", "Other"] as const;

type ProjectDoc = {
  projectName?: string;
  clientId?: string;
  clientName?: string;
  ownerAmUid?: string | null;
  productionUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

function cleanString(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const projectId = cleanString(body?.projectId);
    const category = cleanString(body?.category);
    const fileName = cleanString(body?.fileName);
    const storagePath = cleanString(body?.storagePath);
    const downloadUrl = cleanString(body?.downloadUrl);
    const fileId = cleanString(body?.id) || null;

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    }

    if (!FILE_CATEGORIES.includes(category as (typeof FILE_CATEGORIES)[number])) {
      return NextResponse.json({ ok: false, error: "Invalid category." }, { status: 400 });
    }

    if (!fileName) {
      return NextResponse.json({ ok: false, error: "File name is required." }, { status: 400 });
    }

    if (!storagePath || !downloadUrl) {
      return NextResponse.json({ ok: false, error: "Storage details are required." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (project?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    if (String((project as any).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = fileId ? adminDb.collection("files").doc(fileId) : adminDb.collection("files").doc();

    const size = Number(body?.size || 0);
    const mimeType = cleanString(body?.mimeType);
    const version = body?.version ? String(body.version).trim() : null;
    const notes = body?.notes ? String(body.notes).trim() : null;

    const previousSnap = await adminDb
      .collection("files")
      .where("tenantId", "==", me.tenantId)
      .where("projectId", "==", projectId)
      .where("category", "==", category)
      .where("isDeleted", "==", false)
      .where("isLatest", "==", true)
      .limit(25)
      .get();

    if (!previousSnap.empty) {
      const batch = adminDb.batch();
      previousSnap.docs.forEach((doc) => {
        batch.update(doc.ref, { isLatest: false, updatedAt: now });
      });
      await batch.commit();
    }

    const payload = {
      id: docRef.id,
      projectId,
      projectName: cleanString(project.projectName || ""),
      clientId: cleanString(project.clientId || ""),
      clientName: cleanString(project.clientName || ""),
      category,
      fileName,
      storagePath,
      downloadUrl,
      size,
      mimeType,
      uploadedByUid: me.uid,
      uploadedByName: cleanString(me.name || me.fullName || me.displayName || ""),
      uploadedByRole: "am",
      version,
      notes,
      isLatest: true,
      isDeleted: false,
      uploadedAt: now,
      updatedAt: now,
    };

    await docRef.set(payload, { merge: true });

    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    const recipients = new Set<string>();
    if (project.productionUid) recipients.add(String(project.productionUid));
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "File uploaded",
            body: `${project.projectName || "Project"} has a new ${category.toLowerCase()} file: ${fileName}.`,
            type: "info",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/projects",
            createdBy: { uid: me.uid, name: cleanString(me.name || me.fullName || me.displayName || "") },
          })
        )
    );

    await createNotificationEvent({
      type: "file.uploaded",
      title: "File uploaded",
      description: `${project.projectName || "Project"} has a new ${category.toLowerCase()} file: ${fileName}.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: cleanString(me.name || me.fullName || me.displayName || ""),
      metadata: {
        category,
        fileName,
        fileId: docRef.id,
      },
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error("am/files upload error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to upload file right now.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
