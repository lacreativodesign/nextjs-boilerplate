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

export async function GET() {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectsSnap = await adminDb.collection("projects").where("tenantId", "==", me.tenantId).where("isDeleted", "==", false).limit(500).get();
    const projectCounts = new Map<string, number>();
    projectsSnap.docs.forEach((doc) => {
      const data = doc.data() as ProjectDoc;
      if (!isOwnedByAm(data, me.uid)) return;
      const clientId = String(data.clientId || "").trim();
      if (!clientId) return;
      projectCounts.set(clientId, (projectCounts.get(clientId) || 0) + 1);
    });

    const clientsSnap = await adminDb.collection("clients").where("tenantId", "==", me.tenantId).orderBy("createdAt", "desc").limit(500).get();
    const clients = clientsSnap.docs
      .map((doc) => {
        const data = doc.data() as ClientDoc;
        if (data.deletedAt) return null;
        const totalProjects = projectCounts.get(doc.id) || 0;
        if (!totalProjects) return null;
        return {
          id: doc.id,
          companyName: data.companyName || "",
          industry: data.industry || "",
          country: data.country || "",
          timezone: data.timezone || "",
          primaryContactName: data.primaryContactName || "",
          primaryContactEmail: data.primaryContactEmail || "",
          primaryContactPhone: data.primaryContactPhone || "",
          totalProjects,
          lastActivity: toISO(data.lastActivity),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    console.error("am/clients list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load clients.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
