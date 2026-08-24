import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { ensureTenantClientIdentity } from '@/lib/client-identity';

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
  emailError?: string;
  alreadyInvited?: boolean;
};

function normalizeEmail(value: string | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function cleanString(value: string | undefined) {
  return String(value || '').trim();
}

export async function ensureClientPortalAccess({
  tenantId,
  clientId,
  clientData,
  createdByUid,
  allowExistingInvite = false,
}: {
  tenantId: string;
  clientId: string;
  clientData: ClientData;
  createdByUid?: string | null;
  allowExistingInvite?: boolean;
}): Promise<PortalInviteResult> {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error('Primary contact email is required for portal access.');
  }

  const portalUserUid = cleanString(clientData.portalUserUid);
  const identity = await ensureTenantClientIdentity({ tenantId, clientId, clientData });

  if (portalUserUid && !allowExistingInvite) {
    return {
      uid: identity.uid,
      email: identity.email,
      emailSent: false,
      alreadyInvited: true,
    };
  }

  const tokenData = await createPasswordSetupToken({
    uid: identity.uid,
    email: identity.email,
    createdBy: createdByUid || null,
  });

  const emailResult = await sendSetPasswordEmail({ email: identity.email, link: tokenData.link });

  await adminDb.collection('clients').doc(clientId).set(
    {
      portalUserUid: identity.uid,
      tenantId,
      portalInviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    uid: identity.uid,
    email: identity.email,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  };
}
