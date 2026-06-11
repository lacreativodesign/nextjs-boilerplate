import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { WORKFLOW_TEMPLATES } from '@/lib/automation/workflow-templates';
import { sendEmail } from '@/lib/email/email-service';
import { welcomeEmailHtml, welcomeEmailSubject } from '@/lib/email/html-templates';
import { DEFAULT_ROLES } from '@/lib/tenant/constants';
import { createTenantWorkspace } from '@/lib/tenant/onboarding';
import { PLAN_MODULES } from '@/app/config/plans';

export const runtime = 'nodejs';

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/\d/, 'Password must include at least one number'),
  phone: z.string().trim().min(7, 'Phone number is required'),
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  industry: z.string().trim().optional().default(''),
  companySize: z.string().trim().optional().default(''),
  country: z.string().trim().min(1, 'Country is required'),
  state: z.string().trim().optional().default(''),
  timezone: z.string().trim().optional().default(''),
  currency: z.string().trim().optional().default(''),
  selectedPlan: z.enum(['starter', 'pro', 'enterprise']),
  referredBy: z.string().trim().min(1).nullable().optional().default(null),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms and Conditions to continue' }),
  }),
  termsVersion: z.string().trim().min(1, 'Terms version is required'),
});

type SignupVerificationRecord = {
  uid: string;
  email: string;
  tenantId: string;
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: string;
  consumedAt: null | string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
}

function slugifyCompany(companyName: string) {
  const slug = companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return slug || 'workspace';
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  return forwardedFor.split(',')[0]?.trim() || realIp || 'unknown';
}

function buildModulesEnabled(selectedPlan: 'starter' | 'pro' | 'enterprise') {
  return { ...PLAN_MODULES[selectedPlan] };
}

async function generateUniqueTenantId(companyName: string) {
  const base = slugifyCompany(companyName);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomBytes(2).toString('hex');
    const candidate = `${base}-${suffix}`;
    const tenantSnap = await adminDb.collection('tenants').doc(candidate).get();

    if (!tenantSnap.exists) {
      return candidate;
    }
  }

  throw new Error('TENANT_ID_GENERATION_FAILED');
}

export async function POST(request: Request) {
  let createdUid: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { ok: false, error: firstIssue?.message || 'Invalid input' },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const email = normalizeEmail(payload.email);
    const nowIso = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const existingUserQuery = await adminDb
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (!existingUserQuery.empty) {
      return NextResponse.json(
        { ok: false, error: 'Email already exists. Please login.' },
        { status: 409 },
      );
    }

    const tenantId = await generateUniqueTenantId(payload.companyName);

    const authUser = await adminAuth.createUser({
      email,
      password: payload.password,
      displayName: payload.fullName,
      disabled: false,
      emailVerified: false,
    });
    createdUid = authUser.uid;

    await createTenantWorkspace({
      tenantId,
      name: payload.companyName,
      fullName: payload.fullName,
      email,
      plan: payload.selectedPlan,
      ownerId: authUser.uid,
      trialEndsAt,
    });

    await adminDb.collection('users').doc(authUser.uid).set({
      uid: authUser.uid,
      tenantId,
      email,
      displayName: payload.fullName,
      phone: payload.phone,
      role: 'admin',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
      isDeleted: false,
    });

    await adminAuth.setCustomUserClaims(authUser.uid, {
      role: 'admin',
      tenantId,
    });

    const modulesEnabled = buildModulesEnabled(payload.selectedPlan);

    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .set(
        {
          termsAcceptedAt: nowIso,
          termsAcceptedIp: getClientIp(request),
          termsVersion: payload.termsVersion,
          settings: {
            timezone: payload.timezone,
            currency: payload.currency,
            country: payload.country,
            state: payload.state,
          },
          industry: payload.industry,
          companySize: payload.companySize,
          contactPhone: payload.phone,
          modulesEnabled,
          rolesEnabled: DEFAULT_ROLES,
          updatedAt: nowIso,
        },
        { merge: true },
      );

    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .set(
        {
          plan: payload.selectedPlan,
          trialEndsAt,
          subscriptionState: 'trial',
          referredBy: payload.referredBy || null,
          modules: modulesEnabled,
        },
        { merge: true },
      );

    const signupToken = crypto.randomUUID();
    const verificationDoc: SignupVerificationRecord = {
      uid: authUser.uid,
      email,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
    } as SignupVerificationRecord;

    await adminDb.collection('signup_verifications').doc(signupToken).set(verificationDoc);

    return NextResponse.json({
      ok: true,
      tenantId,
      uid: authUser.uid,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('signup POST error', error);

    if (createdUid) {
      try {
        await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.error('signup POST cleanup error', cleanupError);
      }
    }

    return NextResponse.json({ ok: false, error: 'Unable to complete signup.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { signupToken?: string } | null;
    const signupToken = String(body?.signupToken || '').trim();

    if (!signupToken) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification token.' },
        { status: 400 },
      );
    }

    const verificationRef = adminDb.collection('signup_verifications').doc(signupToken);
    const verificationSnap = await verificationRef.get();
    if (!verificationSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Verification token not found.' },
        { status: 404 },
      );
    }

    const verification = verificationSnap.data() as {
      uid: string;
      email: string;
      tenantId: string;
      expiresAt: string;
      consumedAt?: string | null;
    };

    if (verification.consumedAt) {
      return NextResponse.json(
        { success: false, error: 'Verification token already used.' },
        { status: 409 },
      );
    }

    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'Verification token expired.' },
        { status: 410 },
      );
    }

    const user = await adminAuth.getUser(verification.uid);
    if (!user.emailVerified) {
      return NextResponse.json(
        { success: false, error: 'Email is not verified yet.' },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const workflowTemplates = Object.values(WORKFLOW_TEMPLATES).slice(0, 3);
    const workflowOps = workflowTemplates.map((template) => {
      const ref = adminDb.collection('automation_workflows').doc();
      return ref.set({
        ...template,
        id: ref.id,
        tenantId: verification.tenantId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: verification.uid,
        updatedBy: verification.uid,
      });
    });

    await Promise.all([
      verificationRef.set({ consumedAt: nowIso }, { merge: true }),
      adminDb
        .collection('users')
        .doc(verification.uid)
        .set({ onboardingStatus: 'pending', updatedAt: nowIso }, { merge: true }),
      ...workflowOps,
      adminDb.collection('signup_events').add({
        type: 'trial_signup_verified',
        uid: verification.uid,
        tenantId: verification.tenantId,
        email: verification.email,
        createdAt: nowIso,
      }),
    ]);

    await sendEmail({
      to: verification.email,
      subject: welcomeEmailSubject(verification.email.split('@')[0]),
      html: welcomeEmailHtml({
        name: verification.email.split('@')[0],
        companyName: verification.email.split('@')[0],
        loginUrl: `${resolveAppUrl()}/onboarding`,
        trialDays: 14,
      }),
    });

    // Notify super admin of new signup — non-blocking
    sendEmail({
      to: 'admin@bizosto.com',
      subject: `🆕 New tenant signed up — ${verification.tenantId}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Platform Alert</div></td>
</tr></table>
</td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">🆕 New Tenant Signed Up</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A new workspace has been created on Bizosto</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Email</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${verification.email}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Tenant ID</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${verification.tenantId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Plan</td><td style="font-weight:600;color:#059669;text-align:right;">Trial (14 days)</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/super_admin/tenants" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View in Super Admin →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table>
</td></tr></table>
</body></html>`,
    }).catch((err) => console.error('[SIGNUP] Failed to notify super admin', err));

    const customToken = await adminAuth.createCustomToken(verification.uid, {
      tenantId: verification.tenantId,
      role: 'admin',
      plan: 'trial',
    });

    return NextResponse.json({ success: true, customToken, redirectTo: '/onboarding' });
  } catch (error) {
    console.error('signup PUT error', error);
    return NextResponse.json(
      { success: false, error: 'Unable to complete verification.' },
      { status: 500 },
    );
  }
}
