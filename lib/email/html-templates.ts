function shell(body: string): string {
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
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">${body}</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;">
<p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#2563EB;text-decoration:none;">bizosto.com</a> · <a href="https://bizosto.com/support" style="color:#2563EB;text-decoration:none;">Support</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function btn(label: string, href: string, color = '#2563EB'): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background-color:${color};border-radius:8px;"><a href="${href}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">${label}</a></td></tr></table>`;
}

function divider(): string {
  return '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">';
}

export type WelcomeEmailData = {
  name: string;
  companyName: string;
  loginUrl: string;
  trialDays?: number;
};

export function welcomeEmailHtml(data: WelcomeEmailData): string {
  const { name, companyName, loginUrl, trialDays = 14 } = data;
  return shell(`
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#1E3A5F;">Welcome to Bizosto, ${name}! 🎉</h1>
    <p style="margin:0 0 24px;color:#64748B;font-size:14px;">Your ${trialDays}-day free trial is ready for <strong>${companyName}</strong></p>
    <p>Your workspace is set up and ready to go. You have <strong>${trialDays} days</strong> to explore everything. Your card won't be charged until day ${trialDays + 1} — cancel anytime before then and pay nothing.</p>
    ${btn('Access Your Dashboard', loginUrl, '#059669')}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
    <td width="33%" style="padding:12px;text-align:center;vertical-align:top;">
    <div style="font-size:24px;">💰</div>
    <div style="font-size:13px;font-weight:600;color:#1E3A5F;margin-top:8px;">Finance</div>
    <div style="font-size:12px;color:#64748B;margin-top:4px;">Invoices, payments & reports</div>
    </td>
    <td width="33%" style="padding:12px;text-align:center;vertical-align:top;">
    <div style="font-size:24px;">👥</div>
    <div style="font-size:13px;font-weight:600;color:#1E3A5F;margin-top:8px;">HR</div>
    <div style="font-size:12px;color:#64748B;margin-top:4px;">Employees, leave & payroll</div>
    </td>
    <td width="33%" style="padding:12px;text-align:center;vertical-align:top;">
    <div style="font-size:24px;">🎯</div>
    <div style="font-size:13px;font-weight:600;color:#1E3A5F;margin-top:8px;">CRM</div>
    <div style="font-size:12px;color:#64748B;margin-top:4px;">Leads, deals & pipeline</div>
    </td>
    </tr>
    </table>
    ${divider()}
    <p style="font-size:13px;color:#94A3B8;">Questions? Reply to this email — we read every one.</p>
  `);
}

export function welcomeEmailSubject(name: string): string {
  return `Welcome to Bizosto, ${name}! Your trial workspace is ready`;
}

export type TrialReminderEmailData = {
  name: string;
  daysLeft: number;
  upgradeUrl: string;
  trialEndsAt: string;
};

export function trialReminderEmailHtml(data: TrialReminderEmailData): string {
  const { name, daysLeft, upgradeUrl, trialEndsAt } = data;
  const urgent = daysLeft <= 3;
  const headerColor = urgent ? '#D97706' : '#2563EB';
  const badge = urgent
    ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;font-weight:600;">⚠️ Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining</div>`
    : `<div style="background:#DBEAFE;border:1px solid #2563EB;color:#1E3A5F;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;">Your trial ends on <strong>${trialEndsAt}</strong></div>`;
  return shell(`
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:${headerColor};">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h1>
    <p>Hi ${name},</p>
    <p>Don't lose access to your workspace and all your data. Upgrade now to keep everything running.</p>
    ${badge}
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
    <tr style="background:#F8FAFC;"><td style="font-weight:600;color:#1E3A5F;font-size:13px;">Plan</td><td style="font-weight:600;color:#1E3A5F;font-size:13px;text-align:right;">Price/mo</td></tr>
    <tr><td style="font-size:14px;color:#1E293B;">Starter</td><td style="font-size:14px;color:#1E293B;text-align:right;font-weight:600;">$79</td></tr>
    <tr style="background:#F0FDF4;"><td style="font-size:14px;color:#059669;font-weight:600;">Pro ⭐</td><td style="font-size:14px;color:#059669;text-align:right;font-weight:600;">$149</td></tr>
    <tr><td style="font-size:14px;color:#1E293B;">Enterprise</td><td style="font-size:14px;color:#1E293B;text-align:right;font-weight:600;">$299</td></tr>
    </table>
    ${btn('Upgrade Now', upgradeUrl, '#059669')}
    <p style="font-size:13px;color:#94A3B8;">All your data is safe and will be preserved when you upgrade.</p>
  `);
}

export function trialReminderEmailSubject(daysLeft: number): string {
  if (daysLeft === 1) return '⚠️ Your Bizosto trial ends tomorrow — keep your data';
  if (daysLeft <= 3) return `⚠️ Your Bizosto trial ends in ${daysLeft} days`;
  return `Your Bizosto trial ends in ${daysLeft} days — upgrade to keep access`;
}

export type SubscriptionActivatedEmailData = {
  name: string;
  plan: string;
  amount: number;
  nextBillingDate: string;
  dashboardUrl: string;
};

export function subscriptionActivatedEmailHtml(data: SubscriptionActivatedEmailData): string {
  const { name, plan, amount, nextBillingDate, dashboardUrl } = data;
  return shell(`
    <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;background:#D1FAE5;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;">✓</div>
    </div>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#059669;text-align:center;">Subscription Confirmed</h1>
    <p style="text-align:center;color:#64748B;margin:0 0 28px;">Your full access is now active</p>
    <p>Hi ${name}, thank you for subscribing to Bizosto.</p>
    <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
    <tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Plan</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${plan}</td></tr>
    <tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Amount</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">$${amount}/month</td></tr>
    <tr><td style="color:#64748B;font-size:13px;">Next billing date</td><td style="font-weight:600;color:#1E293B;text-align:right;">${nextBillingDate}</td></tr>
    </table>
    ${btn('Go to Dashboard', dashboardUrl)}
  `);
}

export function subscriptionActivatedEmailSubject(plan: string): string {
  return `Subscription confirmed — ${plan} plan is now active`;
}

export type InvoiceEmailData = {
  clientName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  viewUrl: string;
  senderName?: string;
};

export function invoiceEmailHtml(data: InvoiceEmailData): string {
  const {
    clientName,
    invoiceNumber,
    amount,
    currency,
    dueDate,
    viewUrl,
    senderName = 'Bizosto',
  } = data;
  return shell(`
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#1E3A5F;">Invoice from ${senderName}</h1>
    <p>Hi ${clientName},</p>
    <p>Please find your invoice details below.</p>
    <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
    <tr style="background:#F8FAFC;"><td colspan="2" style="font-weight:700;color:#1E3A5F;font-size:15px;">Invoice #${invoiceNumber}</td></tr>
    <tr><td style="color:#64748B;font-size:13px;border-top:1px solid #F1F5F9;">Amount Due</td><td style="font-weight:700;color:#1E293B;font-size:18px;text-align:right;border-top:1px solid #F1F5F9;">${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
    <tr><td style="color:#64748B;font-size:13px;border-top:1px solid #F1F5F9;">Due Date</td><td style="font-weight:600;color:#DC2626;text-align:right;border-top:1px solid #F1F5F9;">${dueDate}</td></tr>
    </table>
    ${btn('View & Pay Invoice', viewUrl)}
    <p style="font-size:13px;color:#94A3B8;">This invoice was sent via Bizosto. If you have questions, contact the sender directly.</p>
  `);
}

export function invoiceEmailSubject(data: InvoiceEmailData): string {
  return `Invoice #${data.invoiceNumber} — ${data.currency} ${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} due ${data.dueDate}`;
}

export type PaymentReceiptEmailData = {
  name: string;
  amount: number;
  currency: string;
  date: string;
  invoiceNumber: string;
  dashboardUrl: string;
};

export function paymentReceiptEmailHtml(data: PaymentReceiptEmailData): string {
  const { name, amount, currency, date, invoiceNumber, dashboardUrl } = data;
  return shell(`
    <div style="text-align:center;margin-bottom:24px;">
    <div style="display:inline-block;background:#D1FAE5;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;">✓</div>
    </div>
    <h1 style="text-align:center;margin:0 0 8px;font-size:22px;font-weight:700;color:#059669;">Payment Confirmed</h1>
    <p style="text-align:center;color:#64748B;margin:0 0 28px;">Your payment has been received</p>
    <p>Hi ${name}, thank you for your payment.</p>
    <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
    <tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Amount Paid</td><td style="font-weight:700;color:#059669;font-size:18px;text-align:right;border-bottom:1px solid #F1F5F9;">${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
    <tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Date</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${date}</td></tr>
    <tr><td style="color:#64748B;font-size:13px;">Invoice Reference</td><td style="font-weight:600;color:#1E293B;text-align:right;">#${invoiceNumber}</td></tr>
    </table>
    <p style="text-align:center;color:#059669;font-weight:600;">Your account is up to date ✓</p>
    ${btn('View Dashboard', dashboardUrl)}
  `);
}

export function paymentReceiptEmailSubject(invoiceNumber: string): string {
  return `Payment received — Invoice #${invoiceNumber} — Thank you!`;
}

export type PasswordResetEmailData = {
  name: string;
  resetUrl: string;
  expiresIn?: string;
};

export function passwordResetEmailHtml(data: PasswordResetEmailData): string {
  const { name, resetUrl, expiresIn = '1 hour' } = data;
  return shell(`
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#1E3A5F;">Reset your password</h1>
    <p>Hi ${name},</p>
    <p>We received a request to reset the password for your Bizosto account. Click the button below to set a new password.</p>
    <p style="font-size:13px;color:#64748B;">This link expires in <strong>${expiresIn}</strong>.</p>
    ${btn('Reset Password', resetUrl)}
    <div style="background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;padding:12px 16px;border-radius:8px;margin-top:16px;font-size:13px;">
    🔒 If you did not request a password reset, you can safely ignore this email. Your password will not be changed.
    </div>
  `);
}

export function passwordResetEmailSubject(): string {
  return 'Reset your Bizosto password';
}

export type SetPasswordEmailData = {
  email: string;
  setPasswordUrl: string;
  expiresIn?: string;
  isNewUser?: boolean;
};

export function setPasswordEmailHtml(data: SetPasswordEmailData): string {
  const { email, setPasswordUrl, expiresIn = '24 hours', isNewUser = true } = data;
  return shell(`
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#1E3A5F;">${isNewUser ? 'Welcome — set your password' : 'Set a new password'}</h1>
    <p>Hi,</p>
    <p>${isNewUser ? `Your Bizosto account has been created for <strong>${email}</strong>. Click the button below to set your password and activate your account.` : `Click the button below to set a new password for <strong>${email}</strong>.`}</p>
    <p style="font-size:13px;color:#64748B;">This link expires in <strong>${expiresIn}</strong>.</p>
    ${btn('Set Password', setPasswordUrl)}
    <div style="background:#F1F5F9;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:13px;color:#64748B;">
    🔒 If you did not expect this email, you can safely ignore it. Your account will not be activated without clicking the link.
    </div>
  `);
}

export function setPasswordEmailSubject(isNewUser = true): string {
  return isNewUser
    ? 'Activate your Bizosto account — set your password'
    : 'Set your new Bizosto password';
}
