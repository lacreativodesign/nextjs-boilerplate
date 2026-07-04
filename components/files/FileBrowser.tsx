'use client';

import { useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';

type FileRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  tags: string[];
  latestVersion: number;
  previewUrl?: string;
};

export function FileBrowser({
  files,
  onOpenPreview,
  onOpenVersions,
  onRefresh,
}: {
  files: FileRecord[];
  onOpenPreview: (file: FileRecord) => void;
  onOpenVersions: (fileId: string) => void;
  onRefresh: () => void;
}) {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tagFilter, setTagFilter] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      files.filter((file) => {
        const q = search.toLowerCase();
        const matchesSearch = !q || file.name.toLowerCase().includes(q);
        const matchesTag = !tagFilter || file.tags.includes(tagFilter.toLowerCase());
        return matchesSearch && matchesTag;
      }),
    [files, search, tagFilter],
  );

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`btn ${view === 'grid' ? '' : 'ghost'}`}
            onClick={() => setView('grid')}
          >
            Grid
          </button>
          <button
            className={`btn ${view === 'list' ? '' : 'ghost'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <input
            className="input"
            style={{ maxWidth: 160 }}
            placeholder="Search files"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="input"
            style={{ maxWidth: 140 }}
            placeholder="Filter by tag"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <button className="btn ghost" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          title="No files here yet"
          description="Upload a file or create a folder to get started."
        />
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'space-y-2'}>
          {filtered.map((file) => (
            <div key={file.id} className="rounded border p-3">
              <div className="font-semibold">{file.name}</div>
              <div className="text-xs text-gray-500">
                v{file.latestVersion} • {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
              <div className="mt-1 text-xs">{file.tags.join(', ')}</div>
              <div className="mt-2 flex gap-2">
                <button className="btn ghost" onClick={() => onOpenPreview(file)}>
                  Preview
                </button>
                <button className="btn ghost" onClick={() => onOpenVersions(file.id)}>
                  Versions
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
