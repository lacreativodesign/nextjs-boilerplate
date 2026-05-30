"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebaseClient";

export default function ImpersonationBanner() {
  const [data, setData] = useState<{
    tenantId: string;
    impersonatedByEmail: string;
  } | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    getFirebaseAuth().then((auth) => {
      unsub = auth.onAuthStateChanged(async (user) => {
        if (!user) { setData(null); return; }
        try {
          const result = await user.getIdTokenResult();
          const claims = result.claims as Record<string, unknown>;
          if (claims?.isImpersonating && claims?.tenantId) {
            setData({
              tenantId: String(claims.tenantId),
              impersonatedByEmail: String(claims.impersonatedByEmail || "super admin"),
            });
          } else {
            setData(null);
          }
        } catch {
          setData(null);
        }
      });
    });

    return () => { if (unsub) unsub(); };
  }, []);

  if (!data) return null;

  const handleExit = async () => {
    try {
      const auth = await getFirebaseAuth();
      await auth.signOut();
    } catch {}
    finally {
      window.close();
      setTimeout(() => { window.location.href = "/login"; }, 300);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: "linear-gradient(90deg,#b45309,#d97706)",
      color: "#fff", padding: "10px 20px",
      display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 12,
      fontSize: 13, fontWeight: 600,
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>👁️</span>
        <span>
          IMPERSONATING:{" "}
          <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 4 }}>
            {data.tenantId}
          </span>
          &nbsp;· by {data.impersonatedByEmail}
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "1px solid rgba(255,255,255,0.4)",
          color: "#fff", padding: "6px 14px", borderRadius: 6,
          cursor: "pointer", fontSize: 12, fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ✕ Exit Impersonation
      </button>
    </div>
  );
}
