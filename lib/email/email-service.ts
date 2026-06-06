import crypto from "crypto";
import { Resend } from "resend";

// ─── Resend (primary provider) ────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.ONBOARDING_FROM_EMAIL || "Bizosto <hello@bizosto.com>";

// ─── SendGrid (secondary) ─────────────────────────────────────────────────
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "";

// ─── AWS SES (tertiary) ───────────────────────────────────────────────────
const SES_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
const SES_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
const SES_REGION = process.env.AWS_REGION || "";
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || "";

const DEFAULT_PROVIDER = process.env.NOTIFICATIONS_EMAIL_PROVIDER || "auto";

type EmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
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

async function sendWithResend(params: EmailParams) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  const resend = new Resend(RESEND_API_KEY);
  const from = params.fromEmail
    ? (params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail)
    : RESEND_FROM;

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

async function sendWithSendGrid(params: EmailParams) {
  if (!SENDGRID_API_KEY) throw new Error("SendGrid API key is not configured.");
  const fromEmail = params.fromEmail || SENDGRID_FROM_EMAIL;
  if (!fromEmail) throw new Error("SendGrid from email is not configured.");

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: fromEmail, name: params.fromName || SENDGRID_FROM_NAME || undefined },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text || params.html.replace(/<[^>]*>/g, "") },
        { type: "text/html", value: params.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid send failed: ${response.status} ${body}`);
  }
}

function signAwsRequest({
  method, host, path, body, region, service, accessKeyId, secretAccessKey,
}: {
  method: string; host: string; path: string; body: string;
  region: string; service: string; accessKeyId: string; secretAccessKey: string;
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.[0-9]{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const hashedPayload = crypto.createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const kDate = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { amzDate, authorizationHeader };
}

async function sendWithSes(params: EmailParams) {
  if (!hasSesConfig()) throw new Error("SES is not configured.");
  const fromEmail = params.fromEmail || SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("SES from email is not configured.");
  const host = `email.${SES_REGION}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const payload = {
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [params.to] },
    Content: { Simple: { Subject: { Data: params.subject }, Body: { Html: { Data: params.html }, Text: { Data: params.text || params.html.replace(/<[^>]*>/g, "") } } } },
  };
  const body = JSON.stringify(payload);
  const { amzDate, authorizationHeader } = signAwsRequest({ method: "POST", host, path, body, region: SES_REGION, service: "ses", accessKeyId: SES_ACCESS_KEY_ID, secretAccessKey: SES_SECRET_ACCESS_KEY });
  const response = await fetch(`https://${host}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Amz-Date": amzDate, Authorization: authorizationHeader }, body });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`SES send failed: ${response.status} ${responseBody}`);
  }
}

export async function sendEmail(params: EmailParams) {
  const provider = DEFAULT_PROVIDER.toLowerCase();

  if (provider === "resend") { await sendWithResend(params); return; }
  if (provider === "sendgrid") { await sendWithSendGrid(params); return; }
  if (provider === "ses") { await sendWithSes(params); return; }

  // auto mode — use whichever is configured, Resend first
  if (hasResendConfig()) { await sendWithResend(params); return; }
  if (hasSendGridConfig()) { await sendWithSendGrid(params); return; }
  if (hasSesConfig()) { await sendWithSes(params); return; }

  throw new Error("No email provider configured. Set RESEND_API_KEY, SendGrid, or SES credentials.");
}
