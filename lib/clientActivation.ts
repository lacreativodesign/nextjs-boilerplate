import crypto from 'crypto';
import * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { appUrl } from '@/lib/urls';
import { normalizeTenantId } from '@/lib/tenant';

// P0-4b: was a hardcoded constant with no env read, so it could not work on a preview
// deployment. P0-5: resolved through the canonical app URL helper.
const DASHBOARD_LOGIN_URL = appUrl('/login');

type ClientActivationData = {
  primaryContactEmail?: string;
  primaryContactName?: string;
  companyName?: string;
  portalUserUid?: string;
  tenantId?: string;
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
  clientId,
  clientData,
  tenantId,
  createdByUid,
}: {
  clientId: string;
  clientData: ClientActivationData;
  tenantId?: string | null;
  createdByUid?: string | null;
}): Promise<ClientActivationResult> {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error('Primary contact email is required for account activation.');
  }

  const scopedTenantId = normalizeTenantId(tenantId || clientData.tenantId || null);
  const existingPortalUserUid = cleanString(clientData.portalUserUid);
  let portalUserUid = existingPortalUserUid;

  if (portalUserUid) {
    const existingUser = await adminAuth.getUser(portalUserUid).catch(() => null);
    if (!existingUser) {
      portalUserUid = '';
    }
  }

  let userRecord = portalUserUid ? null : await adminAuth.getUserByEmail(email).catch(() => null);
  if (!portalUserUid) {
    if (!userRecord) {
      userRecord = await adminAuth.createUser({
        email,
        password: crypto.randomBytes(16).toString('hex'),
        displayName: cleanString(clientData.primaryContactName || clientData.companyName || email),
      });
    }
    portalUserUid = userRecord.uid;
  }

  await adminDb.collection('users').doc(portalUserUid).set(
    {
      uid: portalUserUid,
      role: 'client',
      status: 'active',
      clientId,
      tenantId: scopedTenantId,
      email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Portal access is a tenant boundary. Claims must be present before the client can
  // traverse middleware / Firestore rules; payment-triggered activation cannot create a
  // user document that is missing the tenant claim.
  await adminAuth.setCustomUserClaims(portalUserUid, {
    role: 'client',
    tenantId: scopedTenantId,
  });

  let setPasswordLink: string | undefined;
  let activationPrepared = false;
  const needsActivation = !existingPortalUserUid;

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
      tenantId: scopedTenantId,
      portalUserUid,
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
  clientId,
  clientData,
  tenantId,
  createdByUid,
  reason,
}: {
  clientId: string;
  clientData: ClientActivationData;
  tenantId?: string | null;
  createdByUid?: string | null;
  reason?: string;
}) {
  const email = normalizeEmail(clientData.primaryContactEmail);
  if (!email) {
    throw new Error('Primary contact email is required for account activation.');
  }

  const scopedTenantId = normalizeTenantId(tenantId || clientData.tenantId || null);
  const existingUserSnap = await adminDb
    .collection('users')
    .where('clientId', '==', clientId)
    .where('tenantId', '==', scopedTenantId)
    .where('role', '==', 'client')
    .limit(1)
    .get();

  if (!existingUserSnap.empty) {
    return { ok: true, created: false };
  }

  const activation = await ensureClientAccountActivation({
    clientId,
    clientData,
    tenantId: scopedTenantId,
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
      tenantId: scopedTenantId,
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
