import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

    // Verify-and-CONSUME-before-provision gate (E7): never create a tenant/user until the email is
    // proven via OTP, and burn the OTP atomically in the same transaction that validates it.
    // Previously the OTP was only READ here and deleted at the very end, leaving a wide TOCTOU
    // window: two concurrent requests both saw verified:true and both provisioned an Auth user and
    // a tenant from a single code (duplicate tenants). A transaction makes the consume atomic —
    // exactly one racing request can win, every other gets a clean 403.
    // /api/auth/send-otp is rate-limited (3 per email per 10 min); /api/auth/verify-otp sets
    // verified:true on email_otps/{email}.
    const otpRef = adminDb.collection('email_otps').doc(email);
    const otpGate = await adminDb.runTransaction(async (tx) => {
      const otpSnap = await tx.get(otpRef);
      const otpData = otpSnap.data();

      if (!otpSnap.exists || otpData?.verified !== true) {
        return { ok: false as const, error: 'unverified' };
      }

      const otpCreatedAt = Number(otpData?.createdAt || 0);
      if (!otpCreatedAt || Date.now() - otpCreatedAt > 24 * 60 * 60 * 1000) {
        return { ok: false as const, error: 'expired' };
      }

      // Burn it now, inside the transaction. A verified code is strictly single-use.
      tx.delete(otpRef);
      return { ok: true as const };
    });

    if (!otpGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            otpGate.error === 'expired'
              ? 'Your email verification has expired. Please request a new code.'
              : 'Please verify your email with the code we sent before continuing.',
        },
        { status: 403 },
      );
    }

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
      // The email was proven via the verified OTP gate above — mark it verified at creation.
      emailVerified: true,
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
          // S38: signup provisions the tenant but never grants live access. The tenant sits in
          // `pending_checkout` (fails closed to hard_locked in normalizeSubscriptionState, so
          // middleware blocks the app) until Stripe Checkout completes. The
          // checkout.session.completed webhook — via linkExistingTenant → applySubscriptionState
          // ('checkout.linked') — is the sole writer that flips this to 'active'.
          subscriptionState: 'pending_checkout',
          referredBy: payload.referredBy || null,
          modules: modulesEnabled,
        },
        { merge: true },
      );

    // NOTE: the OTP was already consumed atomically in the transaction above, before any
    // provisioning — there is nothing to delete here.

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

export async function PUT() {
  // Deprecated: the legacy token-based verification flow is retired. OTP email
  // verification (send-otp / verify-otp) is the canonical signup verification
  // path — the POST handler above requires a fresh verified OTP before any
  // tenant or user is provisioned, and consumes it on success.
  return NextResponse.json(
    { success: false, error: 'This verification flow is deprecated.' },
    { status: 410 },
  );
}
