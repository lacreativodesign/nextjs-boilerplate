'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';

type Version = { id: string; versionNumber: number; createdAt?: { _seconds?: number } };

export function VersionHistoryViewer({
  fileId,
  onRestored,
}: {
  fileId: string;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);

  const load = async () => {
    const res = await apiFetch(`/api/files/${fileId}/versions`, { cache: 'no-store' });
    const payload = await res.json();
    setVersions(payload.versions || []);
  };

  useEffect(() => {
    void load();
  }, [fileId]);

  const restore = async (versionId: string) => {
    const res = await apiFetch(`/api/files/${fileId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId }),
    });
    if (res.ok) {
      onRestored();
      await load();
    }
  };

  return (
    <div className="space-y-2 rounded border p-3">
      <h4 className="text-sm font-semibold">Version history</h4>
      {versions.map((version) => (
        <div key={version.id} className="flex items-center justify-between text-sm">
          <span>v{version.versionNumber}</span>
          <button className="btn ghost" onClick={() => restore(version.id)}>
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
