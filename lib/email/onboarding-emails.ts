import { Resend } from "resend";
import { adminDb } from "@/lib/firebaseAdmin";

const onboardingFrom = process.env.ONBOARDING_FROM_EMAIL || "Bizosto <welcome@bizosto.com>";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://bizosto.com";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY missing");
  }

  return new Resend(apiKey);
}

function formatTrialDate(trialEndsAt: string) {
  const date = new Date(trialEndsAt);
  if (Number.isNaN(date.getTime())) return trialEndsAt;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getEmailShell(content: string) {
  return `
    <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb;">
      <div style="background: linear-gradient(135deg, #012167, #6692f9); padding: 24px; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.08em;">BIZOSTO</div>
      <div style="padding: 32px 24px; background: #ffffff; color: #111827; line-height: 1.6;">
        ${content}
      </div>
    </div>
  `;
}

function ctaButton(label: string, href: string) {
  return `<a href="${href}" style="background: #012167; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">${label}</a>`;
}

function emailFooter(content: string) {
  return `<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${content}</div>`;
}

export async function sendWelcomeEmail(to: string, name: string, tenantId: string) {
  const resend = getResendClient();

  await resend.emails.send({
    from: onboardingFrom,
    to,
    subject: "Welcome to Bizosto! 🎉",
    html: `
      <h1>Welcome to Bizosto, ${name}!</h1>
      <p>Your workspace is ready. Here's what to do next:</p>
      <ol>
        <li>Complete your profile</li>
        <li>Invite your team</li>
        <li>Add your first client</li>
        <li>Create your first invoice</li>
      </ol>
      <a href="${appUrl}/login?tenant=${encodeURIComponent(tenantId)}">Get Started →</a>
    `,
  });
}

export async function sendTrialDaySevenEmail(to: string, name: string, tenantId: string, trialEndsAt: string) {
  try {
    const resend = getResendClient();
    const formattedDate = formatTrialDate(trialEndsAt);

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: "Your Bizosto trial — 7 days to go 🚀",
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>You're one week into your Bizosto trial. Here's what to make the most of your remaining 7 days:</p>
        <ul style="padding-left: 20px; margin: 16px 0;">
          <li style="margin-bottom: 8px;">Connect your team — invite your colleagues to collaborate</li>
          <li style="margin-bottom: 8px;">Add your first client — start managing your relationships</li>
          <li style="margin-bottom: 8px;">Create an invoice — see the finance module in action</li>
        </ul>
        <div style="margin: 24px 0;">${ctaButton("Go to Dashboard", `${appUrl}/dashboard`)}</div>
        <p>Your trial ends on ${formattedDate}.</p>
        ${emailFooter("Questions? Reply to this email. — The Bizosto Team")}
      `),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send trial day 7 email", { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialDayThreeEmail(to: string, name: string, tenantId: string, trialEndsAt: string) {
  try {
    const resend = getResendClient();
    const formattedDate = formatTrialDate(trialEndsAt);

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: "Your Bizosto trial ends in 3 days",
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your free trial ends in 3 days. Add your payment details now to keep uninterrupted access to your workspace.</p>
        <p>If no payment method is added before your trial ends, your account will enter a grace period.</p>
        <div style="margin: 24px 0;">${ctaButton("Add Payment Method", `${appUrl}/billing`)}</div>
        <p>Trial ends: ${formattedDate}</p>
        ${emailFooter("The Bizosto Team")}
      `),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send trial day 3 email", { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialDayOneEmail(to: string, name: string, tenantId: string, trialEndsAt: string) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: "⚠️ Your Bizosto trial ends tomorrow",
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your 14-day free trial ends tomorrow. Add your payment method today to avoid any interruption to your workspace.</p>
        <div style="background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 14px; border-radius: 8px; margin: 16px 0 24px;">
          Without a payment method, your account will enter read-only mode after your trial ends.
        </div>
        <div style="margin: 24px 0;">${ctaButton("Add Payment Method Now", `${appUrl}/billing`)}</div>
        <p style="font-size: 14px; color: #6b7280;">Trial ends: ${formatTrialDate(trialEndsAt)}</p>
        ${emailFooter("The Bizosto Team")}
      `),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send trial day 1 email", { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialExpiredEmail(to: string, name: string, tenantId: string) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: "Your Bizosto trial has ended",
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your 14-day free trial has ended. Your workspace is currently in grace period — you can still access your data but cannot make changes.</p>
        <div style="margin: 24px 0;">${ctaButton("Upgrade Now", `${appUrl}/billing`)}</div>
        <p>Your workspace and all data will be preserved. Upgrade at any time to restore full access.</p>
        ${emailFooter("The Bizosto Team")}
      `),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send trial expired email", { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialGracePeriodEndingEmail(to: string, name: string, tenantId: string) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: "Action required — Bizosto account access at risk",
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your Bizosto account will be locked in 48 hours unless a payment method is added.</p>
        <p>After this point, you will lose access to your workspace until payment is completed. Your data will be retained for 30 days.</p>
        <div style="margin: 24px 0;">${ctaButton("Restore Access Now", `${appUrl}/billing`)}</div>
        ${emailFooter("The Bizosto Team")}
      `),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send grace period ending email", { to, tenantId, error });
    throw error;
  }
}

export async function scheduleOnboardingEmails(email: string, tenantId: string) {
  await adminDb.collection("scheduled_emails").doc(tenantId).set(
    {
      tenantId,
      email,
      status: "pending",
      createdAt: new Date().toISOString(),
      day7Sent: false,
      day3Sent: false,
      day1Sent: false,
      expiredSent: false,
      gracePeriodEndSent: false,
    },
    { merge: true }
  );
}
