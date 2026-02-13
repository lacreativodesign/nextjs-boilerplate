import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { getGoogleIntegration } from "@/lib/integrations/google-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const integration = await getGoogleIntegration(auth.user.tenantId);

    return NextResponse.json({
      ok: true,
      connection: {
        connected: Boolean(integration?.connected),
        accountEmail: integration?.accountEmail || null,
        scopes: integration?.scopes || [],
        calendarSyncEnabled: integration?.calendarSyncEnabled !== false,
        gmailEnabled: integration?.gmailEnabled !== false,
        driveFolderId: integration?.driveFolderId || null,
        updatedBy: integration?.updatedBy || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load Google connection." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    await adminDb
      .collection("tenants")
      .doc(auth.user.tenantId)
      .collection("integrations")
      .doc("googleWorkspace")
      .set(
        {
          calendarSyncEnabled: body.calendarSyncEnabled !== undefined ? Boolean(body.calendarSyncEnabled) : undefined,
          gmailEnabled: body.gmailEnabled !== undefined ? Boolean(body.gmailEnabled) : undefined,
          driveFolderId: body.driveFolderId !== undefined ? (body.driveFolderId ? String(body.driveFolderId) : null) : undefined,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to update Google connection." }, { status: 500 });
  }
}
