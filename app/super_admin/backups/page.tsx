"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

type BackupRow = {
  id: string;
  tenantId: string;
  collections: string[];
  status: string;
  restoreStatus?: string;
  timestamp?: { seconds?: number };
};

export default function SuperAdminBackupsPage() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  const hasBackups = useMemo(() => backups.length > 0, [backups]);

  useEffect(() => {
    let active = true;

    async function loadBackups() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/backup/list", { cache: "no-store", credentials: "include" });
        const payload = (await response.json()) as { ok: boolean; backups?: BackupRow[]; error?: string };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Failed to load backups");
        }

        if (active) {
          setBackups(payload.backups || []);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load backups");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBackups();

    return () => {
      active = false;
    };
  }, []);

  const handleRestore = async (backupId: string) => {
    const confirmed = window.confirm("Restore this backup? This action will overwrite tenant collection data.");
    if (!confirmed) {
      return;
    }

    setRestoringBackupId(backupId);

    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backupId }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Restore failed");
      }

      window.alert("Backup restore started successfully.");
    } catch (err: any) {
      window.alert(err?.message || "Restore failed");
    } finally {
      setRestoringBackupId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backups</h1>
          <p className="page-subtitle">Manage tenant snapshots and restore historical data.</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Collections</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[var(--text-muted)]" colSpan={5}>
                  Loading backups...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-6 text-red-500" colSpan={5}>
                  {error}
                </td>
              </tr>
            ) : !hasBackups ? (
              <tr>
                <td className="px-4 py-6 text-[var(--text-muted)]" colSpan={5}>
                  No backups found.
                </td>
              </tr>
            ) : (
              backups.map((backup) => (
                <tr key={backup.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-3 font-medium">{backup.tenantId}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {backup.timestamp?.seconds
                      ? new Date(backup.timestamp.seconds * 1000).toLocaleString()
                      : "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{backup.collections?.length || 0} collections</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span>{backup.status || "unknown"}</span>
                      {backup.restoreStatus ? (
                        <span className="text-xs text-[var(--text-muted)]">Restore: {backup.restoreStatus}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRestore(backup.id)}
                      disabled={Boolean(restoringBackupId)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                      {restoringBackupId === backup.id ? "Restoring..." : "Restore"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
