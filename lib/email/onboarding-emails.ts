import { Resend } from 'resend';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  welcomeEmailHtml,
  welcomeEmailSubject,
  trialReminderEmailHtml,
  trialReminderEmailSubject,
} from '@/lib/email/html-templates';
import { getAppUrl } from '@/lib/urls';

const onboardingFrom = process.env.ONBOARDING_FROM_EMAIL || 'Bizosto <welcome@bizosto.com>';
// P0-4b: this fell back to https://bizosto.com — the marketing site, which serves neither
// /login nor /billing. Every trial, payment-failed and restore-access email sent a paying
// customer to a 404 whenever NEXT_PUBLIC_APP_URL was unset (any preview deployment).
const appUrl = getAppUrl();

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY missing');
  }

  return new Resend(apiKey);
}

function formatTrialDate(trialEndsAt: string) {
  const date = new Date(trialEndsAt);
  if (Number.isNaN(date.getTime())) return trialEndsAt;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getEmailShell(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bizosto</title></head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:14px;vertical-align:middle;">
<div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">B</div>
</td>
<td style="vertical-align:middle;">
<div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.1em;font-family:Arial,sans-serif;">BIZOSTO</div>
<div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;font-family:Arial,sans-serif;">Business Management Platform</div>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">${content}</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;">
<p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a> · <a href="https://bizosto.com/support" style="color:#012167;text-decoration:none;">Support</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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

export async function sendTrialDaySevenEmail(
  to: string,
  name: string,
  tenantId: string,
  trialEndsAt: string,
) {
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
    console.error('[EMAIL] Failed to send trial day 7 email', { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialDayThreeEmail(
  to: string,
  name: string,
  tenantId: string,
  trialEndsAt: string,
) {
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
    console.error('[EMAIL] Failed to send trial day 3 email', { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialDayOneEmail(
  to: string,
  name: string,
  tenantId: string,
  trialEndsAt: string,
) {
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
    console.error('[EMAIL] Failed to send trial day 1 email', { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialExpiredEmail(to: string, name: string, tenantId: string) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: 'Your Bizosto trial has ended',
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your 14-day free trial has ended. Your workspace is currently in grace period — you can still access your data but cannot make changes.</p>
        <div style="margin: 24px 0;">${ctaButton('Upgrade Now', `${appUrl}/billing`)}</div>
        <p>Your workspace and all data will be preserved. Upgrade at any time to restore full access.</p>
        ${emailFooter('The Bizosto Team')}
      `),
    });
  } catch (error) {
    console.error('[EMAIL] Failed to send trial expired email', { to, tenantId, error });
    throw error;
  }
}

export async function sendTrialGracePeriodEndingEmail(to: string, name: string, tenantId: string) {
  try {
    const resend = getResendClient();

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: 'Action required — Bizosto account access at risk',
      html: getEmailShell(`
        <p>Hi ${name},</p>
        <p>Your Bizosto account will be locked in 48 hours unless a payment method is added.</p>
        <p>After this point, you will lose access to your workspace until payment is completed. Your data will be retained for 30 days.</p>
        <div style="margin: 24px 0;">${ctaButton('Restore Access Now', `${appUrl}/billing`)}</div>
        ${emailFooter('The Bizosto Team')}
      `),
    });
  } catch (error) {
    console.error('[EMAIL] Failed to send grace period ending email', { to, tenantId, error });
    throw error;
  }
}

export async function scheduleOnboardingEmails(email: string, tenantId: string) {
  await adminDb.collection('scheduled_emails').doc(tenantId).set(
    {
      tenantId,
      email,
      status: 'pending',
      createdAt: new Date().toISOString(),
      day7Sent: false,
      day3Sent: false,
      day1Sent: false,
      expiredSent: false,
      gracePeriodEndSent: false,
    },
    { merge: true },
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
        ${invoiceUrl ? `<p style="margin:0 0 24px"><a href="${invoiceUrl}" style="display:inline-block;padding:12px 24px;background:#012167;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Download Invoice</a></p>` : ''}
        <p style="margin:0 0 8px">You can view your full billing history and manage your subscription at any time:</p>
        <p style="margin:0"><a href="${appUrl}/billing" style="color:#012167;font-weight:600">Manage Billing →</a></p>
      `),
    });
  } catch (err) {
    // Never let email failure break the webhook
    console.error('[EMAIL] Failed to send payment confirmation email', err);
  }
}

export async function sendAbandonedSignupReminderEmail(
  to: string,
  name: string,
  tenantId: string,
  variant: 'first' | 'final',
  deleteAt: string,
) {
  try {
    const resend = getResendClient();
    const deletionDate = formatTrialDate(deleteAt);
    const isFinal = variant === 'final';

    await resend.emails.send({
      from: onboardingFrom,
      to,
      subject: isFinal
        ? 'Final notice: your Bizosto workspace will be deleted soon'
        : 'Your Bizosto workspace is still waiting for you',
      html: getEmailShell(`
        <p style="margin:0 0 16px">Hi ${name},</p>
        ${
          isFinal
            ? `<p style="margin:0 0 16px">This is the final reminder about your Bizosto workspace. Because no subscription was started, the workspace and all of its data are scheduled for permanent deletion on <strong>${deletionDate}</strong>.</p>
        <p style="margin:0 0 16px">To keep your workspace, simply choose a plan before that date — everything is exactly as you left it.</p>`
            : `<p style="margin:0 0 16px">You verified your email and created a Bizosto workspace, but never started a subscription. Your workspace is still here, exactly as you left it.</p>
        <p style="margin:0 0 16px">If no subscription is started, the workspace and its data will be permanently deleted on <strong>${deletionDate}</strong>.</p>`
        }
        <p style="margin:0 0 24px">${ctaButton('Choose a plan', `${appUrl}/billing`)}</p>
        ${emailFooter('If you no longer want this workspace, no action is needed — it will be removed automatically.')}
      `),
    });
  } catch (error) {
    console.error('[EMAIL] Failed to send abandoned signup reminder', { tenantId, variant, error });
    throw error;
  }
}
