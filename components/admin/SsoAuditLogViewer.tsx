"use client";

import { useEffect, useState } from "react";

type AuditRow = {
  id: string;
  event: string;
  provider: string;
  status: string;
  actorUid?: string;
  subjectUid?: string;
  createdAt?: { _seconds?: number };
};

export default function SsoAuditLogViewer({ tenantId }: { tenantId: string }) {
  const [logs, setLogs] = useState<AuditRow[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/admin/sso/audit?tenantId=${encodeURIComponent(tenantId)}&limit=50`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data?.ok) return;
        setLogs(data.logs || []);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [tenantId]);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>SSO Audit Logs</div>
      <div className="space-y-2 text-sm">
        {logs.map((log) => (
          <div key={log.id} className="flex flex-wrap items-center justify-between rounded border border-white/10 p-2">
            <div>
              <div>{log.event}</div>
              <div className="text-xs opacity-70">{log.provider} · {log.status}</div>
            </div>
            <div className="text-xs opacity-70">{log.actorUid || "system"}</div>
          </div>
        ))}
        {logs.length === 0 ? <div className="text-xs opacity-70">No SSO audit events yet.</div> : null}
      </div>
    </div>
  );
}
