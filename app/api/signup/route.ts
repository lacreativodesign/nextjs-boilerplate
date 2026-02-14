import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/security";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/workflow-templates";
import { sendEmail } from "@/lib/email/email-service";

export const runtime = "nodejs";

const blockedDomains = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"]);

const signupSchema = z.object({
  name: z.string().trim().min(2, "Full name is required."),
  email: z.string().trim().email("Invalid email address."),
  company: z.string().trim().min(2, "Company name must be at least 2 characters."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/\d/, "Password must contain at least one number.")
    .regex(/[^A-Za-z\d]/, "Password must contain at least one special character."),
  recaptchaToken: z.string().min(1, "reCAPTCHA is required."),
  agreeToLegal: z.literal(true),
});

type SignupVerificationRecord = {
  uid: string;
  email: string;
  tenantId: string;
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: string;
  consumedAt: null | string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  return normalized.slice(normalized.indexOf("@") + 1);
}

function slugifyCompany(company: string) {
  return company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

async function verifyRecaptcha(token: string, remoteIp: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY || "";
  if (!secret) {
    throw new Error("RECAPTCHA_MISCONFIGURED");
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: remoteIp,
  });

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json().catch(() => null)) as { success?: boolean } | null;
  if (!response.ok || !payload?.success) {
    throw new Error("RECAPTCHA_FAILED");
  }
}

function resolveAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

function buildWelcomeHtml(name: string, verificationUrl: string, company: string) {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto;">
    <h1 style="font-size:24px;margin-bottom:12px;">Welcome to Bizosto ERP, ${name}</h1>
    <p>Thanks for starting your 14-day free trial for <strong>${company}</strong>. No credit card is required.</p>
    <p style="margin:24px 0;">
      <a href="${verificationUrl}" style="background:#111827;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;">Verify email & activate trial</a>
    </p>
    <p>This verification link expires in 24 hours.</p>
  </div>`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ success: false, error: issue?.message || "Invalid input." }, { status: 400 });
    }

    const email = normalizeEmail(parsed.data.email);
    const domain = getEmailDomain(email);
    if (blockedDomains.has(domain)) {
      return NextResponse.json(
        { success: false, error: "Please use your work email address (personal email domains are not allowed)." },
        { status: 400 }
      );
    }

    await checkRateLimit(request, "strict", email);

    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    const remoteIp = forwardedFor.split(",")[0]?.trim() || "127.0.0.1";
    await verifyRecaptcha(parsed.data.recaptchaToken, remoteIp);

    const existing = await adminAuth.getUserByEmail(email).catch(() => null);
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already exists. Please login.", loginUrl: "/login" },
        { status: 409 }
      );
    }

    const tenantId = `tenant_${slugifyCompany(parsed.data.company)}_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const user = await adminAuth.createUser({
      email,
      password: parsed.data.password,
      displayName: parsed.data.name,
      emailVerified: false,
      disabled: false,
    });

    await adminAuth.setCustomUserClaims(user.uid, {
      tenantId,
      role: "admin",
      plan: "trial",
    });

    await adminDb.collection("tenants").doc(tenantId).set({
      id: tenantId,
      name: parsed.data.company,
      ownerId: user.uid,
      plan: "trial",
      trialEndsAt,
      createdAt: nowIso,
      updatedAt: nowIso,
      settings: {
        currency: "USD",
        timezone: "UTC",
        language: "en",
      },
      limits: {
        users: 10,
        storage: 5368709120,
        apiCalls: 10000,
      },
      status: "trial",
    });

    await adminDb.collection("users").doc(user.uid).set({
      uid: user.uid,
      name: parsed.data.name,
      email,
      role: "admin",
      tenantId,
      status: "active",
      onboardingStatus: "pending_verification",
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const signupToken = crypto.randomUUID();
    const verificationDoc: SignupVerificationRecord = {
      uid: user.uid,
      email,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
    };

    await adminDb.collection("signup_verifications").doc(signupToken).set(verificationDoc);

    const verificationUrl = await adminAuth.generateEmailVerificationLink(email, {
      url: `${resolveAppUrl()}/verify-email?signupToken=${encodeURIComponent(signupToken)}`,
      handleCodeInApp: true,
    });

    await sendEmail({
      to: email,
      subject: "Verify your email to start your Bizosto ERP trial",
      html: buildWelcomeHtml(parsed.data.name, verificationUrl, parsed.data.company),
      text: `Welcome to Bizosto ERP. Verify your email and activate your trial: ${verificationUrl}`,
    });

    await adminDb.collection("signup_events").add({
      type: "trial_signup_created",
      uid: user.uid,
      tenantId,
      email,
      company: parsed.data.company,
      createdAt: nowIso,
      metadata: {
        source: "self_service_signup",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Check your email to verify your account",
    });
  } catch (error: any) {
    if (error?.message === "RECAPTCHA_FAILED") {
      return NextResponse.json({ success: false, error: "reCAPTCHA verification failed. Please retry." }, { status: 400 });
    }
    if (error?.message === "RECAPTCHA_MISCONFIGURED") {
      return NextResponse.json({ success: false, error: "Signup is temporarily unavailable." }, { status: 503 });
    }

    console.error("signup POST error", error);
    return NextResponse.json({ success: false, error: "Unable to complete signup." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { signupToken?: string } | null;
    const signupToken = String(body?.signupToken || "").trim();

    if (!signupToken) {
      return NextResponse.json({ success: false, error: "Invalid verification token." }, { status: 400 });
    }

    const verificationRef = adminDb.collection("signup_verifications").doc(signupToken);
    const verificationSnap = await verificationRef.get();
    if (!verificationSnap.exists) {
      return NextResponse.json({ success: false, error: "Verification token not found." }, { status: 404 });
    }

    const verification = verificationSnap.data() as {
      uid: string;
      email: string;
      tenantId: string;
      expiresAt: string;
      consumedAt?: string | null;
    };

    if (verification.consumedAt) {
      return NextResponse.json({ success: false, error: "Verification token already used." }, { status: 409 });
    }

    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: "Verification token expired." }, { status: 410 });
    }

    const user = await adminAuth.getUser(verification.uid);
    if (!user.emailVerified) {
      return NextResponse.json({ success: false, error: "Email is not verified yet." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const workflowTemplates = Object.values(WORKFLOW_TEMPLATES).slice(0, 3);
    const workflowOps = workflowTemplates.map((template) => {
      const ref = adminDb.collection("automation_workflows").doc();
      return ref.set({
        ...template,
        id: ref.id,
        tenantId: verification.tenantId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: verification.uid,
        updatedBy: verification.uid,
      });
    });

    await Promise.all([
      verificationRef.set({ consumedAt: nowIso }, { merge: true }),
      adminDb.collection("users").doc(verification.uid).set({ onboardingStatus: "pending", updatedAt: nowIso }, { merge: true }),
      ...workflowOps,
      adminDb.collection("signup_events").add({
        type: "trial_signup_verified",
        uid: verification.uid,
        tenantId: verification.tenantId,
        email: verification.email,
        createdAt: nowIso,
      }),
    ]);

    await sendEmail({
      to: verification.email,
      subject: "Welcome to Bizosto ERP — let’s get you onboarded",
      html: `<p>Your trial is active. Next step: complete onboarding.</p><p><a href="${resolveAppUrl()}/onboarding">Go to onboarding</a></p>`,
      text: `Your trial is active. Start onboarding: ${resolveAppUrl()}/onboarding`,
    });

    const customToken = await adminAuth.createCustomToken(verification.uid, {
      tenantId: verification.tenantId,
      role: "admin",
      plan: "trial",
    });

    return NextResponse.json({ success: true, customToken, redirectTo: "/onboarding" });
  } catch (error) {
    console.error("signup PUT error", error);
    return NextResponse.json({ success: false, error: "Unable to complete verification." }, { status: 500 });
  }
}
