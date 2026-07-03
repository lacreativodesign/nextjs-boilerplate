'use client';

import { useEffect, useState } from 'react';

type Folder = { id: string; name: string; parentFolderId?: string };

export function FolderTreeNavigation({
  currentFolderId,
  onSelect,
}: {
  currentFolderId?: string;
  onSelect: (id?: string) => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);

  const load = async () => {
    const res = await fetch('/api/folders', { cache: 'no-store' });
    const payload = await res.json();
    setFolders(payload.folders || []);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="card space-y-2">
      <button
        className={`block text-sm ${!currentFolderId ? 'font-bold' : ''}`}
        onClick={() => onSelect(undefined)}
      >
        All files
      </button>
      {folders.map((folder) => (
        <button
          key={folder.id}
          className={`block text-sm ${currentFolderId === folder.id ? 'font-bold' : ''}`}
          onClick={() => onSelect(folder.id)}
        >
          {folder.name}
        </button>
      ))}
    </div>
  );
}
