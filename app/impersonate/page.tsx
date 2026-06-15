"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { apiFetch } from "@/lib/api/client";

function ImpersonateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("impersonateToken");
    const tenantId = searchParams.get("tenantId");

    if (!token || !tenantId) {
      setError("Invalid impersonation link.");
      setStatus("error");
      return;
    }

    const run = async () => {
      try {
        const auth = await getFirebaseAuth();
        const cred = await signInWithCustomToken(auth, token);
        const idToken = await cred.user.getIdToken();
        const sessionRes = await apiFetch("/api/session-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, rememberMe: false }),
        });
        if (!sessionRes.ok) throw new Error("Failed to create session");
        router.replace("/dashboard");
      } catch (err: any) {
        setError(err?.message || "Impersonation failed.");
        setStatus("error");
      }
    };

    run();
  }, [router, searchParams]);

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", gap: 12 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: "#DC2626" }}>Impersonation Failed</p>
        <p style={{ fontSize: 14, color: "#64748B" }}>{error}</p>
        <button onClick={() => window.close()} style={{ marginTop: 8, padding: "8px 20px", background: "#012167", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
          Close Tab
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #012167", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <p style={{ fontSize: 15, color: "#64748B", fontWeight: 500 }}>Starting impersonation session...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #012167", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ImpersonateInner />
    </Suspense>
  );
}
