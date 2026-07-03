'use client';

import { useState } from 'react';

import { apiFetch } from '@/lib/api/client';

export function TagManager({ fileId, onUpdated }: { fileId: string; onUpdated: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');

  const addTag = async () => {
    if (!name.trim()) return;
    const res = await apiFetch(`/api/files/${fileId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [{ name, color }] }),
    });
    if (res.ok) {
      setName('');
      onUpdated();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        className="input"
        placeholder="Tag"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      <button className="btn" onClick={addTag}>
        Add tag
      </button>
    </div>
  );
}
