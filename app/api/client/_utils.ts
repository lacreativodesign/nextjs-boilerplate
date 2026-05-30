import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

export type SessionUser = {
  uid: string;
  role: string;
  clientId?: string;
  tenantId?: string;
  [key: string]: unknown;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

async function resolveClientId(uid: string, data: Record<string, unknown>) {
  const tenantId = String((data as unknown).tenantId || "").trim();
  const existingClientId = cleanString(data.clientId);
  if (existingClientId) return existingClientId;

  let email = normalizeEmail(data.email || data.primaryContactEmail || data.primaryContactEmailLower);
  if (!email) {
    const userRecord = await adminAuth.getUser(uid).catch(() => null);
    email = normalizeEmail(userRecord?.email);
  }

  if (!email) return "";

  const byLower = await adminDb
    .collection("clients")
    .where("tenantId", "==", tenantId)
    .where("primaryContactEmailLower", "==", email)
    .limit(1)
    .get();
  const byRaw = byLower.empty
    ? await adminDb.collection("clients").where("tenantId", "==", tenantId).where("primaryContactEmail", "==", email).limit(1).get()
    : null;

  const candidate = byLower.empty ? byRaw?.docs?.[0] : byLower.docs[0];
  if (!candidate) return "";

  const clientData = candidate.data() || {};
  if (clientData.deletedAt) return "";

  const clientId = candidate.id;
  await adminDb
    .collection("users")
    .doc(uid)
    .set({ clientId, updatedAt: new Date().toISOString() }, { merge: true });

  return clientId;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("lac_session")?.value;
    if (!sessionCookie) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data() || {};
    const role = (data.role as string | undefined)?.toLowerCase() || "client";
    const clientId = await resolveClientId(uid, data);
    const tenantId = (data.tenantId as string | undefined) || DEFAULT_TENANT_ID;

    return {
      uid,
      role,
      clientId,
      tenantId,
      ...data,
    } as SessionUser;
  } catch (err) {
    console.error("getSessionUser error:", err);
    return null;
  }
}

export function isClientRole(role: string) {
  return String(role || "").toLowerCase() === "client";
}

export function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as Record<string, unknown>)?.toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function requireClient() {
  const me = await getSessionUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isClientRole(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  const clientId = String(me.clientId || "").trim();
  if (!clientId) {
    return { ok: false as const, status: 404, error: "Client profile not found" };
  }
  return { ok: true as const, user: me, clientId, tenantId: me.tenantId || DEFAULT_TENANT_ID };
}
