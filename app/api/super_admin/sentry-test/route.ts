import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "../_utils";

export const runtime = "nodejs";

type SentryTestType = "error" | "message" | "performance";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const searchParams = req.nextUrl.searchParams;
    const requestedType = searchParams.get("type");
    const type: SentryTestType = requestedType === "message" || requestedType === "performance" ? requestedType : "error";

    if (type === "error") {
      const timestamp = new Date().toISOString();
      const testError = new Error(`[Sentry Test] Intentional test error triggered by super_admin at ${timestamp}`);
      testError.name = "SentryTestError";

      try {
        Sentry.captureException(testError, {
          tags: { test: "true", triggeredBy: "super_admin" },
          extra: { timestamp },
        });
      } catch {
        // Fire-and-forget; never block endpoint on monitoring failures.
      }

      return NextResponse.json({
        ok: true,
        type: "error",
        message: "Test error sent to Sentry",
        sentryEnabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      });
    }

    if (type === "message") {
      try {
        Sentry.captureMessage("[Sentry Test] Manual test message from super_admin", "info");
      } catch {
        // Fire-and-forget; never block endpoint on monitoring failures.
      }

      return NextResponse.json({
        ok: true,
        type: "message",
        message: "Test message sent to Sentry",
      });
    }

    try {
      const transaction = Sentry.startInactiveSpan({ name: "sentry-test-transaction", op: "test" });
      await new Promise((resolve) => setTimeout(resolve, 100));
      transaction.end();
    } catch {
      // Fire-and-forget; never block endpoint on monitoring failures.
    }

    return NextResponse.json({
      ok: true,
      type: "performance",
      message: "Test transaction sent to Sentry",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
