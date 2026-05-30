import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().min(1),
  consentType: z.enum(["terms", "privacy", "marketing", "data_processing"]),
  granted: z.boolean(),
  version: z.string().min(1),
  source: z.enum(["web", "mobile", "api", "admin"]).default("admin"),
  metadata: z.record(z.unknown()).optional(),
});

function canManageCompliance(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "admin" || normalized === "super_admin" || normalized === "owner";
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompliance(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = new URL(request.url).searchParams.get("userId");
  let query: FirebaseFirestore.Query = adminDb
    .collection("tenants")
    .doc(me.tenantId as string)
    .collection("complianceConsentRecords")
    .orderBy("updatedAt", "desc")
    .limit(200);

  if (userId) query = query.where("userId", "==", userId);
  const snapshot = await query.get();
  return NextResponse.json({ consentRecords: snapshot.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() })) });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompliance(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const ref = adminDb.collection("tenants").doc(me.tenantId as string).collection("complianceConsentRecords").doc();
  await ref.set({
    tenantId: me.tenantId,
    ...parsed.data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
