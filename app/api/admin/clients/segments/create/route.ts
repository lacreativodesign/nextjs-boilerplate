import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../../_utils";
import { slugify } from "@/lib/segments";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const type = String(body?.type || "").trim();
  const name = String(body?.name || "").trim();
  if (!type || !name) return NextResponse.json({ ok: false, error: "Type and name are required" }, { status: 400 });

  const slug = slugify(name);
  if (!slug) return NextResponse.json({ ok: false, error: "Invalid segment name" }, { status: 400 });

  const id = `${type}-${slug}`;
  const ref = db.collection("clientSegments").doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    return NextResponse.json({ ok: false, error: "Segment already exists" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await ref.set({
    type,
    name,
    slug,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: me.uid,
  });

  return NextResponse.json({ ok: true, id });
}
