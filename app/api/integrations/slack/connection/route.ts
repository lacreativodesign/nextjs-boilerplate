import admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import { getSlackIntegration, type SlackChannelMap } from '@/lib/integrations/slack';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const integration = await getSlackIntegration(auth.user.tenantId);
    return NextResponse.json({
      ok: true,
      connection: {
        connected: Boolean(integration?.connected),
        teamId: integration?.teamId || null,
        teamName: integration?.teamName || null,
        scopes: integration?.scopes || [],
        defaultChannelId: integration?.defaultChannelId || null,
        channelMappings: integration?.channelMappings || {
          invoicePaid: null,
          projectMilestone: null,
        },
        notifyTaskAssignedDm: integration?.notifyTaskAssignedDm !== false,
        notifyLeaveApprovedDm: integration?.notifyLeaveApprovedDm !== false,
        commandEnabled: integration?.commandEnabled !== false,
        notificationEnabled: integration?.notificationEnabled !== false,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load Slack connection.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const channelMappings = (body?.channelMappings || {}) as Partial<SlackChannelMap>;

    await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection('integrations')
      .doc('slack')
      .set(
        {
          defaultChannelId:
            body.defaultChannelId === undefined ? undefined : body.defaultChannelId || null,
          channelMappings: {
            invoicePaid:
              channelMappings.invoicePaid === undefined
                ? undefined
                : channelMappings.invoicePaid || null,
            projectMilestone:
              channelMappings.projectMilestone === undefined
                ? undefined
                : channelMappings.projectMilestone || null,
          },
          notifyTaskAssignedDm:
            body.notifyTaskAssignedDm === undefined
              ? undefined
              : Boolean(body.notifyTaskAssignedDm),
          notifyLeaveApprovedDm:
            body.notifyLeaveApprovedDm === undefined
              ? undefined
              : Boolean(body.notifyLeaveApprovedDm),
          commandEnabled:
            body.commandEnabled === undefined ? undefined : Boolean(body.commandEnabled),
          notificationEnabled:
            body.notificationEnabled === undefined ? undefined : Boolean(body.notificationEnabled),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to update Slack settings.' },
      { status: 500 },
    );
  }
}
