import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/workflow-templates";
import { sendEmail } from "@/lib/email/email-service";
import { sendWelcomeEmail } from "@/lib/email/onboarding-emails";
import { DEFAULT_MODULES } from "@/lib/tenant/constants";
import { createTenantWorkspace } from "@/lib/tenant/onboarding";

export const runtime = "nodejs";

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  email: z.string().trim().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[a-z]/, "Password must include at least one lowercase letter")
    .regex(/\d/, "Password must include at least one number"),
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters"),
  industry: z.string().trim().optional().default(""),
  companySize: z.string().trim().optional().default(""),
  country: z.string().trim().min(1, "Country is required"),
  state: z.string().trim().optional().default(""),
  timezone: z.string().trim().optional().default(""),
  currency: z.string().trim().optional().default(""),
  selectedModules: z.array(z.string().trim()).default([]),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms and Conditions to continue" }),
  }),
  termsVersion: z.string().trim().min(1, "Terms version is required"),
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

function resolveAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

function slugifyCompany(companyName: string) {
  const slug = companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return slug || "workspace";
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  return forwardedFor.split(",")[0]?.trim() || realIp || "unknown";
}

function buildModulesEnabled(selectedModules: string[]) {
  const normalizedSelection = new Set(
    selectedModules
      .map((moduleKey) => moduleKey.trim())
      .filter(Boolean)
  );

  const modulesEnabled: Record<string, boolean> = {};

  for (const moduleKey of Object.keys(DEFAULT_MODULES)) {
    modulesEnabled[moduleKey] = normalizedSelection.has(moduleKey);
  }

  for (const moduleKey of normalizedSelection) {
    modulesEnabled[moduleKey] = true;
  }

  return modulesEnabled;
}

async function generateUniqueTenantId(companyName: string) {
  const base = slugifyCompany(companyName);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomBytes(2).toString("hex");
    const candidate = `${base}-${suffix}`;
    const tenantSnap = await adminDb.collection("tenants").doc(candidate).get();

    if (!tenantSnap.exists) {
      return candidate;
    }
  }

  throw new Error("TENANT_ID_GENERATION_FAILED");
}

export async function POST(request: Request) {
  let createdUid: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: firstIssue?.message || "Invalid input" }, { status: 400 });
    }

    const payload = parsed.data;
    const email = normalizeEmail(payload.email);
    const nowIso = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const existingUserQuery = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (!existingUserQuery.empty) {
      return NextResponse.json({ ok: false, error: "Email already exists. Please login." }, { status: 409 });
    }

    const tenantId = await generateUniqueTenantId(payload.companyName);

    const authUser = await adminAuth.createUser({
      email,
      password: payload.password,
      displayName: payload.fullName,
      disabled: false,
      emailVerified: false,
    });
    createdUid = authUser.uid;

    await createTenantWorkspace({
      tenantId,
      name: payload.companyName,
      email,
      plan: "trial",
      ownerId: authUser.uid,
      trialEndsAt,
    });

    await adminDb.collection("users").doc(authUser.uid).set({
      uid: authUser.uid,
      tenantId,
      email,
      displayName: payload.fullName,
      role: "admin",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      isDeleted: false,
    });

    await adminAuth.setCustomUserClaims(authUser.uid, {
      role: "admin",
      tenantId,
    });

    const modulesEnabled = buildModulesEnabled(payload.selectedModules);

    await adminDb.collection("tenants").doc(tenantId).set(
      {
        termsAcceptedAt: nowIso,
        termsAcceptedIp: getClientIp(request),
        termsVersion: payload.termsVersion,
        settings: {
          timezone: payload.timezone,
          currency: payload.currency,
          country: payload.country,
          state: payload.state,
        },
        industry: payload.industry,
        companySize: payload.companySize,
        selectedModules: payload.selectedModules,
        modulesEnabled,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    await sendWelcomeEmail(email, payload.fullName, tenantId);

    const signupToken = crypto.randomUUID();
    const verificationDoc: SignupVerificationRecord = {
      uid: authUser.uid,
      email,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
    } as SignupVerificationRecord;

    await adminDb.collection("signup_verifications").doc(signupToken).set(verificationDoc);

    return NextResponse.json({
      ok: true,
      tenantId,
      uid: authUser.uid,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("signup POST error", error);

    if (createdUid) {
      try {
        await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.error("signup POST cleanup error", cleanupError);
      }
    }

    return NextResponse.json({ ok: false, error: "Unable to complete signup." }, { status: 500 });
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
