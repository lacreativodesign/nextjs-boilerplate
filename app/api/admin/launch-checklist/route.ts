import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/email-service";
import { getMonitoringDashboard } from "@/lib/monitoring/dashboard-service";
import {
  AUTOMATED_CHECKS,
  getAllManualCheckIds,
  getAllProductionConfigurationIds,
  normalizeManualCheckId,
  REQUIRED_ENV_VARS,
} from "@/lib/launch-checklist";
import { requireAdminOrSuperAdmin } from "../_utils";

type AutomatedCheckStatus = {
  key: (typeof AUTOMATED_CHECKS)[number]["key"];
  name: string;
  passed: boolean;
  details: string;
};

type LaunchChecklistDoc = {
  manualChecks?: Record<string, boolean>;
  productionConfiguration?: Record<string, boolean>;
  isProductionReady?: boolean;
  publicSignupsEnabled?: boolean;
  launchAnnouncementSentAt?: string | null;
  launchAnnouncementSentBy?: string | null;
  lighthouseScore?: number | null;
  updatedAt?: string;
  updatedBy?: string;
};

const DOC_PATH = ["settings", "launchChecklist"] as const;

function calculateReadinessScore(params: {
  automated: AutomatedCheckStatus[];
  manualChecks: Record<string, boolean>;
  productionConfiguration: Record<string, boolean>;
}) {
  const totalChecks =
    params.automated.length + getAllManualCheckIds().length + getAllProductionConfigurationIds().length;
  const completedAutomated = params.automated.filter((check) => check.passed).length;
  const completedManual = getAllManualCheckIds().filter((id) => params.manualChecks[id]).length;
  const completedConfiguration = getAllProductionConfigurationIds().filter((id) => params.productionConfiguration[id]).length;
  const completedChecks = completedAutomated + completedManual + completedConfiguration;

  return Math.round((completedChecks / totalChecks) * 100);
}

async function runAutomatedChecks(req: Request, storedLighthouseScore?: number | null): Promise<AutomatedCheckStatus[]> {
  const sessionCookie = req.headers.get("cookie") || "";
  const baseUrl = new URL(req.url).origin;

  const envCheckMissing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  const indexesPath = resolve(process.cwd(), "firestore.indexes.json");
  let indexesPassed = false;
  let indexDetails = "firestore.indexes.json was not found.";

  try {
    const raw = await readFile(indexesPath, "utf8");
    const parsed = JSON.parse(raw) as { indexes?: unknown[]; fieldOverrides?: unknown[] };
    const compositeCount = Array.isArray(parsed.indexes) ? parsed.indexes.length : 0;
    const overrideCount = Array.isArray(parsed.fieldOverrides) ? parsed.fieldOverrides.length : 0;
    indexesPassed = compositeCount > 0 || overrideCount > 0;
    indexDetails = `Composite indexes: ${compositeCount}, field overrides: ${overrideCount}.`;
  } catch (error) {
    indexDetails = error instanceof Error ? error.message : "Unable to read Firestore index configuration.";
  }

  const criticalEndpoints = ["/api/admin/overview", "/api/auth/sessions"];
  const endpointResults = await Promise.all(
    criticalEndpoints.map(async (path) => {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "GET",
          headers: { cookie: sessionCookie },
          cache: "no-store",
        });
        return { path, status: response.status, ok: response.ok };
      } catch {
        return { path, status: 0, ok: false };
      }
    })
  );
  const apiRoutesPassed = endpointResults.every((result) => result.ok);

  const lighthouseScore =
    typeof storedLighthouseScore === "number"
      ? storedLighthouseScore
      : Number(process.env.LIGHTHOUSE_PERFORMANCE_SCORE || process.env.NEXT_PUBLIC_LIGHTHOUSE_PERFORMANCE_SCORE || 0);
  const lighthouseValid = Number.isFinite(lighthouseScore) && lighthouseScore > 0;

  const forwardedProto = req.headers.get("x-forwarded-proto") || "";
  const sslPassed = forwardedProto === "https" || new URL(req.url).protocol === "https:";

  return [
    {
      key: "environmentVariables",
      name: "Environment Variables",
      passed: envCheckMissing.length === 0,
      details:
        envCheckMissing.length === 0
          ? `All ${REQUIRED_ENV_VARS.length} required environment variables are configured.`
          : `Missing: ${envCheckMissing.join(", ")}`,
    },
    {
      key: "databaseIndexes",
      name: "Database Indexes",
      passed: indexesPassed,
      details: indexDetails,
    },
    {
      key: "apiRoutes",
      name: "API Routes",
      passed: apiRoutesPassed,
      details: endpointResults.map((entry) => `${entry.path} (${entry.status || "network error"})`).join(", "),
    },
    {
      key: "lighthousePerformance",
      name: "Lighthouse Performance",
      passed: lighthouseValid && lighthouseScore >= 90,
      details: lighthouseValid
        ? `Latest recorded performance score: ${lighthouseScore}. Threshold: >= 90.`
        : "No Lighthouse score found. Provide a score from CI or production audit.",
    },
    {
      key: "sslCertificate",
      name: "SSL Certificate",
      passed: sslPassed,
      details: sslPassed
        ? "Request is served over HTTPS (x-forwarded-proto=https)."
        : "Request was not served over HTTPS. Verify TLS termination and proxy headers.",
    },
    {
      key: "errorTracking",
      name: "Error Tracking",
      passed: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN),
      details: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN ? "Sentry DSN is configured." : "Sentry DSN is missing.",
    },
  ];
}

async function getLaunchMetrics(tenantId: string) {
  const [usersSnap, subscriptionsSnap, paymentsSnap, monitoring] = await Promise.all([
    adminDb.collection("users").where("tenantId", "==", tenantId).get(),
    adminDb.collection("billing_subscriptions").where("tenantId", "==", tenantId).get(),
    adminDb.collection("payments").where("tenantId", "==", tenantId).get(),
    getMonitoringDashboard(),
  ]);

  const signups = usersSnap.size;

  let activeTrials = 0;
  let paid = 0;
  subscriptionsSnap.forEach((doc) => {
    const status = String(doc.data()?.status || "").toLowerCase();
    if (status === "trialing") activeTrials += 1;
    if (["active", "paid"].includes(status)) paid += 1;
  });

  const conversionRate = activeTrials + paid === 0 ? 0 : Math.round((paid / (activeTrials + paid)) * 100);

  let revenue = 0;
  paymentsSnap.forEach((doc) => {
    const amount = Number(doc.data()?.amountUsd || 0);
    if (Number.isFinite(amount)) revenue += amount;
  });

  return {
    signups,
    activeTrials,
    conversionRate,
    revenue: Number(revenue.toFixed(2)),
    errorRate: monitoring.summary.errorRate,
    apiResponseTimeP95: monitoring.summary.responseTimeP95,
  };
}

async function getChecklistDoc() {
  const snap = await adminDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]).get();
  const data = (snap.exists ? snap.data() : {}) as LaunchChecklistDoc;
  return {
    manualChecks: data.manualChecks || {},
    productionConfiguration: data.productionConfiguration || {},
    isProductionReady: Boolean(data.isProductionReady),
    publicSignupsEnabled: Boolean(data.publicSignupsEnabled),
    launchAnnouncementSentAt: data.launchAnnouncementSentAt || null,
    launchAnnouncementSentBy: data.launchAnnouncementSentBy || null,
    lighthouseScore: typeof data.lighthouseScore === "number" ? data.lighthouseScore : null,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const stored = await getChecklistDoc();
    const automatedChecks = await runAutomatedChecks(req, stored.lighthouseScore);
    const readinessScore = calculateReadinessScore({
      automated: automatedChecks,
      manualChecks: stored.manualChecks,
      productionConfiguration: stored.productionConfiguration,
    });
    const metrics = await getLaunchMetrics(auth.user.tenantId);

    return NextResponse.json({
      ok: true,
      automatedChecks,
      manualChecks: stored.manualChecks,
      productionConfiguration: stored.productionConfiguration,
      readinessScore,
      isProductionReady: stored.isProductionReady,
      publicSignupsEnabled: stored.publicSignupsEnabled,
      launchAnnouncementSentAt: stored.launchAnnouncementSentAt,
      launchAnnouncementSentBy: stored.launchAnnouncementSentBy,
      lighthouseScore: stored.lighthouseScore,
      metrics,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("launch checklist GET error", error);
    return NextResponse.json({ ok: false, error: "Unable to load launch checklist." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      id?: string;
      checked?: boolean;
      score?: number;
    };

    const docRef = adminDb.collection(DOC_PATH[0]).doc(DOC_PATH[1]);
    const stored = await getChecklistDoc();

    if (body.action === "toggle-manual") {
      const id = normalizeManualCheckId(String(body.id || ""));
      if (!getAllManualCheckIds().includes(id)) {
        return NextResponse.json({ ok: false, error: "Invalid manual checklist item." }, { status: 400 });
      }
      await docRef.set(
        {
          manualChecks: { ...stored.manualChecks, [id]: Boolean(body.checked) },
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "toggle-production-config") {
      const id = normalizeManualCheckId(String(body.id || ""));
      if (!getAllProductionConfigurationIds().includes(id)) {
        return NextResponse.json({ ok: false, error: "Invalid production configuration item." }, { status: 400 });
      }
      await docRef.set(
        {
          productionConfiguration: { ...stored.productionConfiguration, [id]: Boolean(body.checked) },
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set-lighthouse-score") {
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        return NextResponse.json({ ok: false, error: "Lighthouse score must be a number between 0 and 100." }, { status: 400 });
      }
      await docRef.set(
        {
          lighthouseScore: score,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set-production-ready") {
      await docRef.set(
        {
          isProductionReady: Boolean(body.checked),
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set-public-signups") {
      await docRef.set(
        {
          publicSignupsEnabled: Boolean(body.checked),
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send-launch-announcement") {
      const users = await adminDb.collection("users").where("tenantId", "==", auth.user.tenantId).get();
      const recipients = users.docs
        .map((doc) => ({
          email: String(doc.data()?.email || "").trim(),
          role: String(doc.data()?.role || "").toLowerCase(),
        }))
        .filter((entry) => entry.email && ["admin", "super_admin"].includes(entry.role));

      if (recipients.length === 0) {
        return NextResponse.json({ ok: false, error: "No admin recipients found for launch announcement." }, { status: 400 });
      }

      await Promise.all(
        recipients.map((recipient) =>
          sendEmail({
            to: recipient.email,
            subject: "Bizosto ERP production launch is live",
            html: `<p>Production launch has been approved.</p><p>Approved by: ${auth.user.email || auth.user.uid}</p><p>Time: ${new Date().toISOString()}</p>`,
            text: `Production launch has been approved. Approved by: ${auth.user.email || auth.user.uid}`,
          })
        )
      );

      await docRef.set(
        {
          launchAnnouncementSentAt: new Date().toISOString(),
          launchAnnouncementSentBy: auth.user.uid,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );

      return NextResponse.json({ ok: true, recipients: recipients.length });
    }

    if (body.action === "run-final-tests") {
      const automatedChecks = await runAutomatedChecks(req, stored.lighthouseScore);
      return NextResponse.json({ ok: true, automatedChecks });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("launch checklist POST error", error);
    return NextResponse.json({ ok: false, error: "Unable to process launch checklist action." }, { status: 500 });
  }
}
