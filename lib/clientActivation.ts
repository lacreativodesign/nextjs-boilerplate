import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { appUrl } from '@/lib/urls';
import { ensureTenantClientIdentity } from '@/lib/client-identity';

// P0-4b: was a hardcoded constant with no env read, so it could not work on a preview
// deployment. P0-5: resolved through the canonical app URL helper.
const DASHBOARD_LOGIN_URL = appUrl('/login');

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
  return String(value || '')
    .trim()
    .toLowerCase();
}

function cleanString(value: string | undefined) {
  return String(value || '').trim();
}

export async function ensureClientAccountActivation({
  tenantId,
  clientId,
  clientData,
  createdByUid,
}: {
  tenantId: string;
  clientId: string;
  clientData: ClientActivationData;
  createdByUid?: string | null;
}): Promise<ClientActivationResult> {
  const identity = await ensureTenantClientIdentity({ tenantId, clientId, clientData });
  const portalUserUid = identity.uid;
  const email = normalizeEmail(identity.email);

  let setPasswordLink: string | undefined;
  let activationPrepared = false;
  const needsActivation = identity.created;

  if (needsActivation) {
    const tokenData = await createPasswordSetupToken({
      uid: portalUserUid,
      email,
      createdBy: createdByUid || null,
    });
    setPasswordLink = tokenData.link;
    activationPrepared = true;
  }

  await adminDb.collection('clients').doc(clientId).set(
    {
      portalUserUid,
      tenantId,
      accountStatus: 'ACTIVE',
      accountActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
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
  tenantId,
  clientId,
  clientData,
  createdByUid,
  reason,
}: {
  tenantId: string;
  clientId: string;
  clientData: ClientActivationData;
  createdByUid?: string | null;
  reason?: string;
}) {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error('Primary contact email is required for account activation.');
  }

  const existingUserSnap = await adminDb
    .collection('users')
    .where('tenantId', '==', tenantId)
    .where('clientId', '==', clientId)
    .where('role', '==', 'client')
    .limit(1)
    .get();

  if (!existingUserSnap.empty) {
    return { ok: true, created: false };
  }

  const activation = await ensureClientAccountActivation({
    tenantId,
    clientId,
    clientData,
    createdByUid,
  });

  if (activation.activationPrepared) {
    // P0-5: this used to write a row to `emails` with status 'pending' and stop. Nothing
    // drains that collection, so the set-password link never reached the client and the
    // portal account it had just created was unreachable. The link is now sent inline via
    // the same helper the admin user-creation path already uses, and the row records what
    // actually happened.
    let status: 'sent' | 'failed' | 'unroutable' = 'unroutable';
    let error: string | null = 'No set-password link was generated for this client.';

    if (activation.setPasswordLink) {
      try {
        const result = await sendSetPasswordEmail({
          email,
          link: activation.setPasswordLink,
        });
        status = result.sent ? 'sent' : 'failed';
        error = result.sent ? null : result.error || 'Email provider is not configured.';
      } catch (sendError: unknown) {
        status = 'failed';
        error = sendError instanceof Error ? sendError.message : 'Unknown email provider error';
      }
    }

    if (status !== 'sent') {
      console.error(`[EMAIL] Client activation email not delivered for client=${clientId}:`, error);
    }

    // The set-password link is a live credential and is deliberately not persisted here.
    await adminDb.collection('emails').add({
      to: email,
      template: 'clientActivation',
      subject: 'Activate your BIZOSTO client account',
      data: {
        clientId,
        companyName: cleanString(clientData.companyName),
        contactName: cleanString(clientData.primaryContactName),
        dashboardLoginUrl: activation.dashboardLoginUrl,
      },
      metadata: {
        reason: reason || 'client_activation',
      },
      status,
      error,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { ok: true, created: true };
}
