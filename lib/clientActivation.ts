import crypto from 'crypto';
import * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { appUrl } from '@/lib/urls';
import { normalizeTenantId } from '@/lib/tenant';

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

function requireActivationTenantId(
  tenantId: string | null | undefined,
  clientData: ClientActivationData,
): string {
  const rawTenantId = String(tenantId || clientData.tenantId || '').trim();
  if (!rawTenantId) {
    throw new Error('Tenant id is required for client account activation.');
  }
  return normalizeTenantId(rawTenantId);
}

async function assertPortalIdentityTenant(uid: string, tenantId: string) {
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) return;
  const storedTenantId = String(userSnap.data()?.tenantId || '').trim();
  if (storedTenantId && normalizeTenantId(storedTenantId) !== tenantId) {
    throw new Error('This email is already linked to another Bizosto workspace.');
  }
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

  const scopedTenantId = requireActivationTenantId(tenantId, clientData);
  const existingPortalUserUid = cleanString(clientData.portalUserUid);
  let portalUserUid = existingPortalUserUid;

  if (portalUserUid) {
    const existingUser = await adminAuth.getUser(portalUserUid).catch(() => null);
    if (!existingUser) {
      portalUserUid = '';
    } else {
      await assertPortalIdentityTenant(portalUserUid, scopedTenantId);
    }
  }

  let userRecord = portalUserUid ? null : await adminAuth.getUserByEmail(email).catch(() => null);
  if (!portalUserUid) {
    if (userRecord) {
      await assertPortalIdentityTenant(userRecord.uid, scopedTenantId);
    } else {
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

  const scopedTenantId = requireActivationTenantId(tenantId, clientData);

  const existingUserSnap = await adminDb
    .collection('users')
    .where('clientId', '==', clientId)
    .where('role', '==', 'client')
    .limit(10)
    .get();
  const existingSameTenant = existingUserSnap.docs.some(
    (doc) => normalizeTenantId(doc.data()?.tenantId || null) === scopedTenantId,
  );

  if (existingSameTenant) {
    return { ok: true, created: false };
  }

  const activation = await ensureClientAccountActivation({
    clientId,
    clientData,
    tenantId: scopedTenantId,
    createdByUid,
  });

  if (activation.activationPrepared) {
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
