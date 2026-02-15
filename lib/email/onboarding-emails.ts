import { Resend } from "resend";

const onboardingFrom = process.env.ONBOARDING_FROM_EMAIL || "Bizosto <welcome@bizosto.com>";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://bizosto.com";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY missing");
  }

  return new Resend(apiKey);
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

export async function scheduleOnboardingEmails(email: string, tenantId: string) {
  console.info("[ONBOARDING] Schedule day-3/day-7 onboarding emails", { email, tenantId });
}
