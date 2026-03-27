import { Resend } from "resend";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  welcomeEmailHtml,
  welcomeEmailSubject,
  trialReminderEmailHtml,
  trialReminderEmailSubject,
} from "@/lib/email/html-templates";

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
    subject: welcomeEmailSubject(name),
    html: welcomeEmailHtml({
      name,
      companyName: name,
      loginUrl: `${appUrl}/login?tenant=${encodeURIComponent(tenantId)}`,
      trialDays: 14,
    }),
  });
}

export async function sendTrialDaySevenEmail(to: string, name: string, tenantId: string, trialEndsAt: string) {
  try {
    const resend = getResendClient();
    const formattedDate = formatTrialDate(trialEndsAt);

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: trialReminderEmailSubject(7),
      html: trialReminderEmailHtml({
        name,
        daysLeft: 7,
        upgradeUrl: `${appUrl}/billing`,
        trialEndsAt: formatTrialDate(trialEndsAt),
      }),
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
      subject: trialReminderEmailSubject(3),
      html: trialReminderEmailHtml({
        name,
        daysLeft: 3,
        upgradeUrl: `${appUrl}/billing`,
        trialEndsAt: formatTrialDate(trialEndsAt),
      }),
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
      subject: trialReminderEmailSubject(1),
      html: trialReminderEmailHtml({
        name,
        daysLeft: 1,
        upgradeUrl: `${appUrl}/billing`,
        trialEndsAt: formatTrialDate(trialEndsAt),
      }),
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

export async function sendPaymentConfirmationEmail(
  to: string,
  name: string,
  tenantId: string,
  amount: string,
  invoiceUrl: string | null,
) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: `Payment confirmed — your Bizosto subscription has been renewed`,
      html: getEmailShell(`
        <p style="font-size:16px;font-weight:600;margin:0 0 8px">Hi ${name},</p>
        <p style="margin:0 0 16px">Your Bizosto subscription payment of <strong>${amount}</strong> was successfully processed. Your account is active and all modules are available.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Amount charged</td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;text-align:right">${amount}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Status</td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#16a34a;text-align:right">Paid</td>
          </tr>
        </table>
        ${invoiceUrl ? `<p style="margin:0 0 24px"><a href="${invoiceUrl}" style="display:inline-block;padding:12px 24px;background:#012167;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Download Invoice</a></p>` : ""}
        <p style="margin:0 0 8px">You can view your full billing history and manage your subscription at any time:</p>
        <p style="margin:0"><a href="${appUrl}/billing" style="color:#012167;font-weight:600">Manage Billing →</a></p>
      `),
    });
  } catch (err) {
    // Never let email failure break the webhook
    console.error("[EMAIL] Failed to send payment confirmation email", err);
  }
}
