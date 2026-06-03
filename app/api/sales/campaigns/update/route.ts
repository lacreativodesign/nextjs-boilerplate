import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId } from "@/lib/tenant";
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Campaign id is required." }, { status: 400 });
    }

    const docRef = adminDb.collection("campaigns").doc(id);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }

    const existing = snapshot.data() || {};
    if (auth.user.role !== "super_admin" && docTenantId(existing) !== (auth.user.tenantId || "")) {
      return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }

    if (auth.user.role === "sales" && existing.createdBy !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const name = parseString(payload.name, existing.name || "");
    const channel = parseString(payload.channel, existing.channel || "");
    const status = parseString(payload.status, existing.status || "Active");

    await docRef.set(
      {
        name,
        channel,
        status,
        metrics: payload.metrics || existing.metrics || null,
        updatedAt: serverTimestamp(),
        updatedBy: auth.user.uid,
      },
      { merge: true }
    );

    await createSalesEvent({
      type: "campaign_updated",
      title: "Campaign updated",
      description: `${name || "Campaign"} updated`,
      entityType: "campaign",
      entityId: id,
      createdByUid: auth.user.uid,
      createdByName: userLabel(auth.user),
    });

    const watchers = await getWatcherUserIds();
    await notifyUsers({
      userIds: watchers,
      title: "Campaign updated",
      body: `${name || "Campaign"} status changed to ${status}.`,
      deepLink: "/sales/campaigns",
      entityType: "campaign",
      entityId: id,
      createdBy: { uid: auth.user.uid, name: userLabel(auth.user) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales campaigns update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update campaign." }, { status: 500 });
  }
}
