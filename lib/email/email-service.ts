import crypto from 'crypto';
import { Resend } from 'resend';
import { resolveTenantEmailProvider } from '@/lib/email/tenant-provider';

// ─── Resend (primary provider) ────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.ONBOARDING_FROM_EMAIL || 'Bizosto <hello@bizosto.com>';

// ─── SendGrid (secondary) ─────────────────────────────────────────────────
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || '';

// ─── AWS SES (tertiary) ───────────────────────────────────────────────────
const SES_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const SES_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const SES_REGION = process.env.AWS_REGION || '';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || '';

const DEFAULT_PROVIDER = process.env.NOTIFICATIONS_EMAIL_PROVIDER || 'auto';

type EmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
  /**
   * MAIL-3: where a reply should go.
   *
   * Declared but never sent — every provider call omitted it, so a recipient hitting Reply
   * landed on whatever `from` happened to be. For tenant-to-customer mail that meant
   * replies to an invoice reminder went to a Bizosto inbox the tenant cannot read.
   *
   * Reply-To does not assert an identity the way `from` does: it routes replies and makes
   * no claim about who sent the message. That is why it can carry a tenant's own address
   * before their sending domain is verified, while `from` cannot (MAIL-2).
   */
  replyTo?: string;
  /**
   * MAIL-6: whose provider should carry this message.
   *
   * Set for tenant business mail — an invoice, a reminder, a lead acknowledgement — so it
   * leaves through that tenant's own provider account when they have configured one. Left
   * unset for platform mail (OTP, password setup, subscription billing), which is Bizosto
   * speaking and must always leave through Bizosto's account.
   */
  tenantId?: string;
};

function hasResendConfig() {
  return Boolean(RESEND_API_KEY);
}

function hasSendGridConfig() {
  return Boolean(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL);
}

function hasSesConfig() {
  return Boolean(SES_ACCESS_KEY_ID && SES_SECRET_ACCESS_KEY && SES_REGION && SES_FROM_EMAIL);
}

/**
 * MAIL-3: the bare address inside a configured sender.
 *
 * ONBOARDING_FROM_EMAIL is stored display-name form — `Bizosto <hello@bizosto.com>` — so
 * anything that needs the address alone has to pull it out of the angle brackets.
 */
function addressOf(configured: string) {
  const match = configured.match(/<([^>]+)>/);
  return (match ? match[1] : configured).trim();
}

/**
 * MAIL-3: composes the From header.
 *
 * A display name WITHOUT an address used to be dropped on the floor — the old expression
 * only honoured `fromName` when `fromEmail` was also set, and otherwise fell straight back
 * to the platform sender. That is exactly the case that matters for tenant-to-customer
 * mail whose domain is not verified yet: the message must go out from the platform address
 * (the only domain Bizosto may send from) while showing the TENANT's name, so the
 * recipient knows who is writing to them. Claiming a name is not claiming a domain.
 */
function composeFrom(params: EmailParams, configuredFrom: string) {
  if (params.fromEmail) {
    return params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail;
  }
  if (params.fromName) {
    return `${params.fromName} <${addressOf(configuredFrom)}>`;
  }
  return configuredFrom;
}

async function sendWithResend(params: EmailParams, apiKey?: string) {
  if (!apiKey && !RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey || RESEND_API_KEY);
  const from = composeFrom(params, RESEND_FROM);

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

async function sendWithSendGrid(params: EmailParams, apiKey?: string) {
  const sendGridKey = apiKey || SENDGRID_API_KEY;
  if (!sendGridKey) throw new Error('SendGrid API key is not configured.');
  const fromEmail = params.fromEmail || SENDGRID_FROM_EMAIL;
  if (!fromEmail) throw new Error('SendGrid from email is not configured.');

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendGridKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: fromEmail, name: params.fromName || SENDGRID_FROM_NAME || undefined },
      ...(params.replyTo ? { reply_to: { email: params.replyTo } } : {}),
      subject: params.subject,
      content: [
        { type: 'text/plain', value: params.text || params.html.replace(/<[^>]*>/g, '') },
        { type: 'text/html', value: params.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid send failed: ${response.status} ${body}`);
  }
}

function signAwsRequest({
  method,
  host,
  path,
  body,
  region,
  service,
  accessKeyId,
  secretAccessKey,
}: {
  method: string;
  host: string;
  path: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.[0-9]{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, hashedPayload].join(
    '\n',
  );
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { amzDate, authorizationHeader };
}

async function sendWithSes(params: EmailParams) {
  if (!hasSesConfig()) throw new Error('SES is not configured.');
  const fromEmail = params.fromEmail || SES_FROM_EMAIL;
  if (!fromEmail) throw new Error('SES from email is not configured.');
  // MAIL-3: SES takes the display name inline in the same header.
  const fromHeader = params.fromName ? `${params.fromName} <${fromEmail}>` : fromEmail;
  const host = `email.${SES_REGION}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const payload = {
    FromEmailAddress: fromHeader,
    Destination: { ToAddresses: [params.to] },
    ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: params.html },
          Text: { Data: params.text || params.html.replace(/<[^>]*>/g, '') },
        },
      },
    },
  };
  const body = JSON.stringify(payload);
  const { amzDate, authorizationHeader } = signAwsRequest({
    method: 'POST',
    host,
    path,
    body,
    region: SES_REGION,
    service: 'ses',
    accessKeyId: SES_ACCESS_KEY_ID,
    secretAccessKey: SES_SECRET_ACCESS_KEY,
  });
  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      Authorization: authorizationHeader,
    },
    body,
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`SES send failed: ${response.status} ${responseBody}`);
  }
}

export async function sendEmail(params: EmailParams) {
  // MAIL-6: a tenant's own provider carries their own mail.
  //
  // Until now every message left through Bizosto's Resend account, including mail a tenant
  // sends to its own customers. That means shared deliverability reputation — one tenant
  // sending badly hurts everyone, and a careful tenant cannot build a reputation of their
  // own — and it means bounce and complaint data lands in Bizosto's dashboard rather than
  // where the tenant can act on it.
  //
  // Only mail carrying a tenantId is eligible. Platform mail (OTP, password setup,
  // subscription billing) deliberately passes none: Bizosto is genuinely the sender there,
  // and routing a password reset through a tenant's account would put a Bizosto security
  // message in a third party's sending logs.
  //
  // A tenant with no provider configured, or whose credential cannot be decrypted, falls
  // through to the platform path. A worse envelope is better than an undelivered invoice.
  if (params.tenantId) {
    const tenantProvider = await resolveTenantEmailProvider(params.tenantId);
    if (tenantProvider) {
      if (tenantProvider.provider === 'resend') {
        await sendWithResend(params, tenantProvider.apiKey);
        return;
      }
      if (tenantProvider.provider === 'sendgrid') {
        await sendWithSendGrid(params, tenantProvider.apiKey);
        return;
      }
      // SES needs an access key pair and a region rather than a single token, so a tenant
      // SES account is stored but not yet used to send. Falling through is honest: the
      // message goes out under the platform provider rather than silently failing.
    }
  }

  const provider = DEFAULT_PROVIDER.toLowerCase();

  if (provider === 'resend') {
    await sendWithResend(params);
    return;
  }
  if (provider === 'sendgrid') {
    await sendWithSendGrid(params);
    return;
  }
  if (provider === 'ses') {
    await sendWithSes(params);
    return;
  }

  // auto mode — use whichever is configured, Resend first
  if (hasResendConfig()) {
    await sendWithResend(params);
    return;
  }
  if (hasSendGridConfig()) {
    await sendWithSendGrid(params);
    return;
  }
  if (hasSesConfig()) {
    await sendWithSes(params);
    return;
  }

  throw new Error(
    'No email provider configured. Set RESEND_API_KEY, SendGrid, or SES credentials.',
  );
}
