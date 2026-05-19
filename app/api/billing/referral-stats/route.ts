import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReferralStatus = 'pending' | 'converted' | 'churned';

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeDate = (value as { toDate?: () => Date }).toDate?.();
    return maybeDate instanceof Date && !Number.isNaN(maybeDate.getTime()) ? maybeDate : null;
  }
  return null;
}

function calculateTotalCreditsEarned(convertedCount: number): number {
  if (convertedCount <= 0) return 0;
  if (convertedCount === 1) return 75;
  if (convertedCount === 2) return 175;
  if (convertedCount === 3) return 325;
  if (convertedCount === 4) return 425;
  return 425 + (convertedCount - 5) * 150;
}

function daysBetween(start: Date | null, end: Date): number {
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function getReferralStatus(subscriptionState: string, daysActive: number): ReferralStatus {
  const normalized = subscriptionState.trim().toLowerCase();
  if (
    normalized === 'canceled' ||
    normalized === 'cancelled' ||
    normalized === 'hard_locked' ||
    normalized === 'soft_locked'
  ) {
    return 'churned';
  }
  if (normalized === 'active' && daysActive > 30) {
    return 'converted';
  }
  return 'pending';
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = String(auth.user.tenantId || '').trim();
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant context missing' }, { status: 400 });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(tenantId).get();
    const tenant = tenantSnap.data() || {};
    const referralCode = String(tenant.referralCode || '').trim();
    const referralUrl = referralCode
      ? `https://bizosto.com/signup?ref=${encodeURIComponent(referralCode)}`
      : 'https://bizosto.com/signup?ref=';

    if (!referralCode) {
      return NextResponse.json({
        ok: true,
        referralCode,
        referralUrl,
        totalCreditsEarned: 0,
        pendingCredits: 0,
        convertedCount: 0,
        pendingCount: 0,
        referrals: [],
      });
    }

    const referredTenantsSnap = await adminDb
      .collection('tenants')
      .where('referredBy', '==', referralCode)
      .get();

    const now = new Date();
    const referrals = referredTenantsSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const signedUpDate =
        toDate(data.createdAt) || toDate(data.signupAt) || toDate(data.trialStartedAt);
      const daysActive = daysBetween(signedUpDate, now);
      const subscriptionState = String(data.subscriptionState || data.billingStatus || 'trial');
      const status = getReferralStatus(subscriptionState, daysActive);

      return {
        id: doc.id,
        company: String(data.name || data.companyName || data.brand?.name || 'Unnamed workspace'),
        signedUp: signedUpDate ? signedUpDate.toISOString() : null,
        daysActive,
        status,
        reward: status === 'converted' ? 75 : 0,
      };
    });

    const convertedCount = referrals.filter((referral) => referral.status === 'converted').length;
    const pendingCount = referrals.filter((referral) => referral.status === 'pending').length;

    return NextResponse.json({
      ok: true,
      referralCode,
      referralUrl,
      totalCreditsEarned: calculateTotalCreditsEarned(convertedCount),
      pendingCredits: pendingCount * 75,
      convertedCount,
      pendingCount,
      referrals,
    });
  } catch (error) {
    console.error('[BILLING] Failed to load referral stats', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to load referral stats' },
      { status: 500 },
    );
  }
}
