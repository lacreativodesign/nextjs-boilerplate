"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebaseClient";

export default function ImpersonationBanner() {
  const [impersonationData, setImpersonationData] = useState<{
    tenantId: string;
    impersonatedByEmail: string;
  } | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    getFirebaseAuth().then((auth) => {
      unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (!user) {
          setImpersonationData(null);
          return;
        }
        try {
          const idTokenResult = await user.getIdTokenResult();
          const claims = idTokenResult.claims as Record<string, any>;
          if (claims?.isImpersonating && claims?.tenantId) {
            setImpersonationData({
              tenantId: String(claims.tenantId),
              impersonatedByEmail: String(claims.impersonatedByEmail || "super admin"),
            });
          } else {
            setImpersonationData(null);
          }
        } catch {
          setImpersonationData(null);
        }
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!impersonationData) return null;

  const handleExit = async () => {
    try {
      const auth = await getFirebaseAuth();
      await auth.signOut();
    } catch {
      // ignore
    } finally {
      window.close();
      // Fallback if window.close() is blocked
      setTimeout(() => {
        window.location.href = "/login";
      }, 300);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "linear-gradient(90deg, #b45309, #d97706)",
        color: "#fff",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>👁️</span>
        <span>
          IMPERSONATING TENANT:{" "}
          <span
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "2px 8px",
              borderRadius: 4,
              letterSpacing: "0.05em",
            }}
          >
            {impersonationData.tenantId}
          </span>
          &nbsp;· Initiated by {impersonationData.impersonatedByEmail}
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "1px solid rgba(255,255,255,0.4)",
          color: "#fff",
          padding: "6px 14px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.03em",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.35)")
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.2)")
        }
      >
        ✕ Exit Impersonation
      </button>
    </div>
  );
}
