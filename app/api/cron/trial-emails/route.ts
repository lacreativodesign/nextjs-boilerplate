import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  sendTrialDayOneEmail,
  sendTrialDaySevenEmail,
  sendTrialDayThreeEmail,
  sendTrialExpiredEmail,
  sendTrialGracePeriodEndingEmail,
} from "@/lib/email/onboarding-emails";
import { PLAN_MODULES } from "@/app/config/plans";

export const runtime = "nodejs";

type ScheduledEmailState = {
  tenantId: string;
  email: string;
  status: "pending";
  createdAt: string;
  day7Sent: boolean;
  day3Sent: boolean;
  day1Sent: boolean;
  expiredSent: boolean;
  gracePeriodEndSent: boolean;
  day7SentAt?: string;
  day3SentAt?: string;
  day1SentAt?: string;
  expiredSentAt?: string;
  gracePeriodEndSentAt?: string;
};

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCronFromVercel = process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") === "1";

  if (isCronFromVercel) return true;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

function defaultScheduledState(tenantId: string, email: string): ScheduledEmailState {
  return {
    tenantId,
    email,
    status: "pending",
    createdAt: new Date().toISOString(),
    day7Sent: false,
    day3Sent: false,
    day1Sent: false,
    expiredSent: false,
    gracePeriodEndSent: false,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  let emailsSent = 0;

  try {
    const tenantsSnapshot = await adminDb
      .collection("tenants")
      .where("plan", "==", "trial")
      .where("status", "in", ["trial", "active"])
      .limit(500)
      .get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenantId = tenantDoc.id;
      try {
        const tenantData = tenantDoc.data() as {
          trialEndsAt?: string;
          status?: string;
          plan?: string;
          name?: string;
          ownerId?: string;
        };

        if (!tenantData.trialEndsAt) {
          continue;
        }

        const usersSnapshot = await adminDb
          .collection("users")
          .where("tenantId", "==", tenantId)
          .where("role", "==", "admin")
          .limit(1)
          .get();

        if (usersSnapshot.empty) {
          errors.push(`tenant:${tenantId} missing admin user`);
          continue;
        }

        const ownerData = usersSnapshot.docs[0].data() as {
          email?: string;
          displayName?: string;
        };

        if (!ownerData.email) {
          errors.push(`tenant:${tenantId} admin user missing email`);
          continue;
        }

        const ownerName = ownerData.displayName || "there";
        const trialEndsAt = tenantData.trialEndsAt;

        const daysRemaining = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const scheduledRef = adminDb.collection("scheduled_emails").doc(tenantId);
        const scheduledSnap = await scheduledRef.get();

        let scheduledState: ScheduledEmailState;
        if (!scheduledSnap.exists) {
          scheduledState = defaultScheduledState(tenantId, ownerData.email);
          await scheduledRef.set(scheduledState);
        } else {
          scheduledState = { ...defaultScheduledState(tenantId, ownerData.email), ...(scheduledSnap.data() as Partial<ScheduledEmailState>) };
        }

        const now = new Date().toISOString();

        if (daysRemaining === 7 && !scheduledState.day7Sent) {
          await sendTrialDaySevenEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set({ day7Sent: true, day7SentAt: now, email: ownerData.email }, { merge: true });
          emailsSent += 1;
          continue;
        }

        if (daysRemaining === 3 && !scheduledState.day3Sent) {
          await sendTrialDayThreeEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set({ day3Sent: true, day3SentAt: now, email: ownerData.email }, { merge: true });
          emailsSent += 1;
          continue;
        }

        if (daysRemaining === 1 && !scheduledState.day1Sent) {
          await sendTrialDayOneEmail(ownerData.email, ownerName, tenantId, trialEndsAt);
          await scheduledRef.set({ day1Sent: true, day1SentAt: now, email: ownerData.email }, { merge: true });
          emailsSent += 1;
          continue;
        }

        if (daysRemaining <= 0 && daysRemaining >= -7 && !scheduledState.expiredSent) {
          await sendTrialExpiredEmail(ownerData.email, ownerName, tenantId);
          await scheduledRef.set({ expiredSent: true, expiredSentAt: now, email: ownerData.email }, { merge: true });
          // Downgrade to starter modules so sidebar hides Finance, Production, HR
          // until the tenant upgrades to a paid plan
          await adminDb.collection("tenants").doc(tenantId).set({
            status: "grace_period",
            subscriptionState: "grace",
            billingStatus: "past_due",
            plan: "starter",
            modules: PLAN_MODULES.starter,
          }, { merge: true });
          emailsSent += 1;
          continue;
        }

        if (daysRemaining < -12 && daysRemaining >= -14 && !scheduledState.gracePeriodEndSent) {
          await sendTrialGracePeriodEndingEmail(ownerData.email, ownerName, tenantId);
          await scheduledRef.set({ gracePeriodEndSent: true, gracePeriodEndSentAt: now, email: ownerData.email }, { merge: true });
          // Hard lock — middleware blocks all access, module state does not matter
          // but set starter modules so if they reactivate they start from the right baseline
          await adminDb.collection("tenants").doc(tenantId).set({
            status: "hard_locked",
            subscriptionState: "hard_locked",
            billingStatus: "canceled",
            plan: "starter",
            modules: PLAN_MODULES.starter,
          }, { merge: true });
          emailsSent += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tenant processing error";
        errors.push(`tenant:${tenantId} ${message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      processedTenants: tenantsSnapshot.size,
      emailsSent,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, processedTenants: 0, emailsSent, errors: [...errors, message] }, { status: 500 });
  }
}
