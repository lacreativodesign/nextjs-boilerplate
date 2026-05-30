import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { getMicrosoftIntegration } from "@/lib/integrations/microsoft-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const integration = await getMicrosoftIntegration(auth.user.tenantId as string);
    return NextResponse.json({
      ok: true,
      connection: {
        connected: Boolean(integration?.connected),
        accountEmail: integration?.accountEmail || null,
        accountDisplayName: integration?.accountDisplayName || null,
        microsoftTenantId: integration?.microsoftTenantId || null,
        scopes: integration?.scopes || [],
        calendarSyncEnabled: integration?.calendarSyncEnabled !== false,
        outlookEmailEnabled: integration?.outlookEmailEnabled !== false,
        oneDriveRootFolderId: integration?.oneDriveRootFolderId || null,
        oneDriveRootFolderName: integration?.oneDriveRootFolderName || null,
        updatedBy: integration?.updatedBy || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load Microsoft connection.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => ({}))) as {
      calendarSyncEnabled?: boolean;
      outlookEmailEnabled?: boolean;
      oneDriveRootFolderId?: string | null;
      oneDriveRootFolderName?: string | null;
    };

    await adminDb
      .collection("tenants")
      .doc(auth.user.tenantId as string)
      .collection("integrations")
      .doc("microsoft365")
      .set(
        {
          calendarSyncEnabled: body.calendarSyncEnabled !== undefined ? Boolean(body.calendarSyncEnabled) : undefined,
          outlookEmailEnabled: body.outlookEmailEnabled !== undefined ? Boolean(body.outlookEmailEnabled) : undefined,
          oneDriveRootFolderId:
            body.oneDriveRootFolderId !== undefined ? (body.oneDriveRootFolderId ? String(body.oneDriveRootFolderId) : null) : undefined,
          oneDriveRootFolderName:
            body.oneDriveRootFolderName !== undefined
              ? body.oneDriveRootFolderName
                ? String(body.oneDriveRootFolderName)
                : null
              : undefined,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update Microsoft connection.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
