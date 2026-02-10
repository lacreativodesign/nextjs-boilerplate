import { NextResponse } from "next/server";
import { z } from "zod";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "@/app/api/admin/_utils";
import type { Folder } from "@/types/documents";

export const runtime = "nodejs";

const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  visibility: z.enum(["private", "team", "public"]).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createFolderSchema.parse(body);

    let path = `/${data.name}`;
    let level = 0;

    if (data.parentId) {
      const parentDoc = await adminDb.collection("folders").doc(data.parentId).get();
      if (parentDoc.exists) {
        const parent = parentDoc.data() as Folder;
        if (parent.tenantId !== session.tenantId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        path = `${parent.path}/${data.name}`;
        level = parent.level + 1;
      }
    }

    const now = admin.firestore.Timestamp.now();

    const folder: Omit<Folder, "id"> = {
      tenantId: session.tenantId,
      name: data.name,
      description: data.description,
      color: data.color,
      icon: data.icon,
      parentId: data.parentId,
      path,
      level,
      createdBy: session.uid,
      visibility: data.visibility || "private",
      documentCount: 0,
      totalSize: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection("folders").add(folder);

    return NextResponse.json({
      id: docRef.id,
      ...folder,
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    let query: FirebaseFirestore.Query = adminDb.collection("folders").where("tenantId", "==", session.tenantId);

    if (parentId) {
      query = query.where("parentId", "==", parentId);
    } else {
      query = query.where("level", "==", 0);
    }

    const snapshot = await query.orderBy("name").get();
    const folders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Error fetching folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}
