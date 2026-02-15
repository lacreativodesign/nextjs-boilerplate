import crypto from "crypto";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { createPasswordSetupToken } from "@/lib/passwordSetup";

const DASHBOARD_LOGIN_URL = "https://app.bizosto.com/login";

type ClientActivationData = {
  primaryContactEmail?: string;
  primaryContactName?: string;
  companyName?: string;
  portalUserUid?: string;
};

type ClientActivationResult = {
  portalUserUid: string;
  email: string;
  setPasswordLink?: string;
  dashboardLoginUrl: string;
  activationPrepared: boolean;
};

function normalizeEmail(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function cleanString(value: string | undefined) {
  return String(value || "").trim();
}

export async function ensureClientAccountActivation({
  clientId,
  clientData,
  createdByUid,
}: {
  clientId: string;
  clientData: ClientActivationData;
  createdByUid?: string | null;
}): Promise<ClientActivationResult> {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error("Primary contact email is required for account activation.");
  }

  const existingPortalUserUid = cleanString(clientData.portalUserUid);
  let portalUserUid = existingPortalUserUid;

  if (portalUserUid) {
    const existingUser = await adminAuth.getUser(portalUserUid).catch(() => null);
    if (!existingUser) {
      portalUserUid = "";
    }
  }

  let userRecord = portalUserUid ? null : await adminAuth.getUserByEmail(email).catch(() => null);
  if (!portalUserUid) {
    if (!userRecord) {
      userRecord = await adminAuth.createUser({
        email,
        password: crypto.randomBytes(16).toString("hex"),
        displayName: cleanString(clientData.primaryContactName || clientData.companyName || email),
      });
    }
    portalUserUid = userRecord.uid;
  }

  await adminDb.collection("users").doc(portalUserUid).set(
    {
      uid: portalUserUid,
      role: "client",
      status: "active",
      clientId,
      email,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  let setPasswordLink: string | undefined;
  let activationPrepared = false;
  const needsActivation = !existingPortalUserUid || !portalUserUid;

  if (needsActivation) {
    const tokenData = await createPasswordSetupToken({
      uid: portalUserUid,
      email,
      createdBy: createdByUid || null,
    });
    setPasswordLink = tokenData.link;
    activationPrepared = true;
  }

  await adminDb.collection("clients").doc(clientId).set(
    {
      portalUserUid,
      accountStatus: "ACTIVE",
      accountActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    portalUserUid,
    email,
    setPasswordLink,
    dashboardLoginUrl: DASHBOARD_LOGIN_URL,
    activationPrepared,
  };
}

export async function queueClientActivationInvite({
  clientId,
  clientData,
  createdByUid,
  reason,
}: {
  clientId: string;
  clientData: ClientActivationData;
  createdByUid?: string | null;
  reason?: string;
}) {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error("Primary contact email is required for account activation.");
  }

  const existingUserSnap = await adminDb
    .collection("users")
    .where("clientId", "==", clientId)
    .where("role", "==", "client")
    .limit(1)
    .get();

  if (!existingUserSnap.empty) {
    return { ok: true, created: false };
  }

  const activation = await ensureClientAccountActivation({
    clientId,
    clientData,
    createdByUid,
  });

  if (activation.activationPrepared) {
    await adminDb.collection("emails").add({
      to: email,
      template: "clientActivation",
      subject: "Activate your BIZOSTO client account",
      data: {
        clientId,
        companyName: cleanString(clientData.companyName),
        contactName: cleanString(clientData.primaryContactName),
        setPasswordLink: activation.setPasswordLink || null,
        dashboardLoginUrl: activation.dashboardLoginUrl,
      },
      metadata: {
        reason: reason || "client_activation",
      },
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { ok: true, created: true };
}
