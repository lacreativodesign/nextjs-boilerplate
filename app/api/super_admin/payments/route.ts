import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";
import { getStripeClient } from "@/lib/payments/stripe";
import { plans, type BillingPlanKey } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_DOC_PATH = "cache/super_admin_payments";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TENANTS = 200;

type TenantData = {
  name?: string;
  plan?: string;
  subscriptionState?: string;
  billingStatus?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  lastPaymentAt?: string | null;
  lastInvoiceTotal?: number;
  lastInvoiceTax?: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  trialEndsAt?: string | null;
  status?: string;
};

type PaymentTenant = {
  tenantId: string;
  tenantName: string;
  plan: string;
  subscriptionState: string;
  billingStatus: string;
  mrr: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: string | null;
  lastInvoiceTotal: number;
  lastInvoiceTax: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  status: string;
};

function normalizePlan(value: unknown): BillingPlanKey {
  const plan = String(value || "").toLowerCase().trim();
  if (plan === "trial" || plan === "starter" || plan === "pro" || plan === "enterprise") {
    return plan;
  }
  return "trial";
}

function toUsd(cents: unknown): number {
  const numeric = Number(cents || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric / 100;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const cacheRef = adminDb.doc(CACHE_DOC_PATH);

    if (!refresh) {
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        const cachedAt = parseDate(cacheSnap.get("cachedAt"));
        const data = String(cacheSnap.get("data") || "");
        if (cachedAt && data && Date.now() - cachedAt.getTime() < CACHE_TTL_MS) {
          const parsed = JSON.parse(data);
          return NextResponse.json(parsed);
        }
      }
    }

    const tenantsSnap = await adminDb.collection("tenants").orderBy("createdAt", "desc").limit(MAX_TENANTS).get();
    const stripe = getStripeClient();

    const stripeTasks = tenantsSnap.docs.map(async (tenantDoc) => {
      const data = (tenantDoc.data() || {}) as TenantData;
      const subscriptionId = String(data.stripeSubscriptionId || "").trim();
      if (!subscriptionId) {
        return { tenantId: tenantDoc.id, customerId: null };
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice", "customer"],
        });
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id || null;
        return { tenantId: tenantDoc.id, customerId };
      } catch (error) {
        console.error("[super_admin/payments] Stripe subscription fetch failed", {
          tenantId: tenantDoc.id,
          subscriptionId,
          error,
        });
        return { tenantId: tenantDoc.id, customerId: null };
      }
    });

    const stripeResults = await Promise.allSettled(stripeTasks);
    const stripeMap = new Map<string, { customerId: string | null }>();
    stripeResults.forEach((result) => {
      if (result.status === "fulfilled") {
        stripeMap.set(result.value.tenantId, { customerId: result.value.customerId });
      }
    });

    const byPlan: Record<string, number> = { trial: 0, starter: 0, pro: 0, enterprise: 0 };
    const byState: Record<string, number> = { active: 0, grace: 0, soft_locked: 0, hard_locked: 0 };

    let mrr = 0;
    let taxCollectedThisMonth = 0;
    let totalActiveTenants = 0;
    let totalTrialTenants = 0;
    let totalLockedTenants = 0;

    const tenants: PaymentTenant[] = tenantsSnap.docs
      .map((tenantDoc) => {
        const data = (tenantDoc.data() || {}) as TenantData;
        const plan = normalizePlan(data.plan);
        const subscriptionState = String(data.subscriptionState || "trial").trim() || "trial";
        const billingStatus = String(data.billingStatus || "none").trim() || "none";
        const tenantName = String(data.name || tenantDoc.id);

        byPlan[plan] = (byPlan[plan] || 0) + 1;
        if (subscriptionState in byState) {
          byState[subscriptionState] = (byState[subscriptionState] || 0) + 1;
        }

        if (subscriptionState === "active") {
          mrr += plans[plan].price;
          totalActiveTenants += 1;
        }
        if (plan === "trial") {
          totalTrialTenants += 1;
        }
        if (subscriptionState === "soft_locked" || subscriptionState === "hard_locked") {
          totalLockedTenants += 1;
        }

        const lastInvoiceTaxUsd = toUsd(data.lastInvoiceTax);
        taxCollectedThisMonth += lastInvoiceTaxUsd;

        const stripeLookup = stripeMap.get(tenantDoc.id);
        const stripeCustomerId = data.stripeCustomerId || stripeLookup?.customerId || null;
        const stripeSubscriptionId = data.stripeSubscriptionId || null;

        return {
          tenantId: tenantDoc.id,
          tenantName,
          plan,
          subscriptionState,
          billingStatus,
          mrr: plans[plan].price,
          currentPeriodEnd: data.currentPeriodEnd || null,
          cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
          lastPaymentAt: data.lastPaymentAt || null,
          lastInvoiceTotal: toUsd(data.lastInvoiceTotal),
          lastInvoiceTax: lastInvoiceTaxUsd,
          stripeCustomerId,
          stripeSubscriptionId,
          trialEndsAt: data.trialEndsAt || null,
          status: String(data.status || "active"),
        };
      })
      .filter((tenant) => {
        return Boolean(
          tenant.stripeSubscriptionId ||
            tenant.stripeCustomerId ||
            tenant.plan !== "trial" ||
            tenant.lastPaymentAt ||
            tenant.currentPeriodEnd ||
            tenant.lastInvoiceTotal > 0 ||
            tenant.lastInvoiceTax > 0,
        );
      });

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      metrics: {
        mrr,
        platformFeeRevenue: 0,
        taxCollectedThisMonth,
        totalActiveTenants,
        totalTrialTenants,
        totalLockedTenants,
      },
      breakdown: {
        byPlan,
        byState,
      },
      tenants,
    };

    await cacheRef.set(
      {
        data: JSON.stringify(payload),
        cachedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
