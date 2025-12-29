import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAmUser, isOwnedByAm, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectDoc = {
  clientId?: string;
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

type ClientDoc = {
  companyName?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  lastActivity?: any;
  deletedAt?: any;
};

export async function GET(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = String(searchParams.get("id") || "").trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "Client id is required." }, { status: 400 });
    }

    const projectsSnap = await adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get();
    const hasAccess = projectsSnap.docs.some((doc) => {
      const data = doc.data() as ProjectDoc;
      return isOwnedByAm(data, me.uid) && String(data.clientId || "") === clientId;
    });

    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists || clientSnap.data()?.deletedAt) {
      return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    }

    const data = clientSnap.data() as ClientDoc;
    return NextResponse.json({
      ok: true,
      client: {
        id: clientSnap.id,
        companyName: data.companyName || "",
        industry: data.industry || "",
        country: data.country || "",
        timezone: data.timezone || "",
        primaryContactName: data.primaryContactName || "",
        primaryContactEmail: data.primaryContactEmail || "",
        primaryContactPhone: data.primaryContactPhone || "",
        lastActivity: toISO(data.lastActivity),
      },
    });
  } catch (err: any) {
    console.error("am/clients get error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load client.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
