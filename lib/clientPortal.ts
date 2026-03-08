import crypto from "crypto";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { createPasswordSetupToken, sendSetPasswordEmail } from "@/lib/passwordSetup";

type ClientData = {
  primaryContactEmail?: string;
  primaryContactName?: string;
  companyName?: string;
  portalUserUid?: string;
};

type PortalInviteResult = {
  uid: string;
  email: string;
  emailSent: boolean;
  setPasswordLink?: string;
  emailError?: string;
  alreadyInvited?: boolean;
};

function normalizeEmail(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function cleanString(value: string | undefined) {
  return String(value || "").trim();
}

export async function ensureClientPortalAccess({
  clientId,
  clientData,
  createdByUid,
  allowExistingInvite = false,
}: {
  clientId: string;
  clientData: ClientData;
  createdByUid?: string | null;
  allowExistingInvite?: boolean;
}): Promise<PortalInviteResult> {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error("Primary contact email is required for portal access.");
  }

  let portalUserUid = cleanString(clientData.portalUserUid);

  if (portalUserUid && !allowExistingInvite) {
    return {
      uid: portalUserUid,
      email,
      emailSent: false,
      alreadyInvited: true,
    };
  }

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

  const tokenData = await createPasswordSetupToken({
    uid: portalUserUid,
    email,
    createdBy: createdByUid || null,
  });

  const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

  await adminDb.collection("clients").doc(clientId).set(
    {
      portalUserUid,
      portalInviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    uid: portalUserUid,
    email,
    emailSent: emailResult.sent,
    setPasswordLink: emailResult.sent ? undefined : tokenData.link,
    emailError: emailResult.sent ? undefined : emailResult.error,
  };
}
