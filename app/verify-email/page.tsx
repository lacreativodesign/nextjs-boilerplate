"use client";

import { useEffect, useMemo, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signInWithCustomToken } from "firebase/auth";

type VerifyState = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("Verifying your email...");

  const params = useMemo(() => {
    if (typeof window === "undefined") return { oobCode: "", signupToken: "" };
    const query = new URLSearchParams(window.location.search);
    return {
      oobCode: query.get("oobCode") || "",
      signupToken: query.get("signupToken") || "",
    };
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        if (!params.oobCode || !params.signupToken) {
          throw new Error("Missing verification parameters.");
        }

        const auth = await getFirebaseAuth();
        await applyActionCode(auth, params.oobCode);

        const finalizeResponse = await fetch("/api/signup", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ signupToken: params.signupToken }),
        });

        const finalizePayload = (await finalizeResponse.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          customToken?: string;
          redirectTo?: string;
        } | null;

        if (!finalizeResponse.ok || !finalizePayload?.success || !finalizePayload.customToken) {
          throw new Error(finalizePayload?.error || "Unable to finalize verification.");
        }

        await signInWithCustomToken(auth, finalizePayload.customToken);

        const idToken = await auth.currentUser?.getIdToken(true);
        if (!idToken) {
          throw new Error("Unable to complete authenticated session.");
        }

        const sessionResponse = await fetch("/api/session-login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, rememberMe: true }),
        });

        if (!sessionResponse.ok) {
          const payload = await sessionResponse.json().catch(() => null);
          throw new Error(payload?.error || "Unable to create session.");
        }

        setStatus("success");
        setMessage("Email verified. Redirecting to onboarding...");
        window.location.href = finalizePayload.redirectTo || "/onboarding";
      } catch (error: any) {
        setStatus("error");
        setMessage(error?.message || "Email verification failed.");
      }
    };

    void run();
  }, [params.oobCode, params.signupToken]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Email verification</h1>
        <p className={`mt-4 text-sm ${status === "error" ? "text-red-600" : "text-slate-600"}`}>{message}</p>
        {status === "error" ? (
          <a href="/login" className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Go to login</a>
        ) : null}
      </section>
    </main>
  );
}
