'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { managedFileDownloadHref } from '@/lib/storage/download-hrefs';

/**
 * P0-07: the preview URL is requested when the modal opens, from a route that enforces
 * the file's ACL and signs a URL that lives for minutes. Records no longer carry a
 * persisted 2-day `previewUrl`, and reopening the modal simply asks again, so an expired
 * URL is never a broken preview.
 */
function usePreviewUrl(fileId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({
    url: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !fileId) {
      setState({ url: null, error: null });
      return;
    }
    let alive = true;
    apiFetch(`${managedFileDownloadHref(fileId, { inline: true })}&format=json`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !payload?.url) {
          setState({ url: null, error: payload?.error || 'Preview unavailable.' });
        } else {
          setState({ url: String(payload.url), error: null });
        }
      })
      .catch(() => alive && setState({ url: null, error: 'Preview unavailable.' }));
    return () => {
      alive = false;
    };
  }, [fileId, enabled]);

  return state;
}

export function FilePreviewModal({
  open,
  onClose,
  file,
}: {
  open: boolean;
  onClose: () => void;
  file?: { id: string; name: string; mimeType: string };
}) {
  const isPreviewable = Boolean(
    file &&
    (file.mimeType.startsWith('image/') ||
      file.mimeType === 'application/pdf' ||
      file.mimeType.startsWith('video/')),
  );
  const preview = usePreviewUrl(file?.id, open && isPreviewable);

  if (!open || !file) return null;
  const previewUrl = preview.url;

  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  const isVideo = file.mimeType.startsWith('video/');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-[90vw] overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">{file.name}</h3>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {isImage && previewUrl ? (
          <div className="relative h-[75vh] w-full">
            <Image
              src={previewUrl}
              alt={file.name}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 90vw"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nMTInIHZpZXdCb3g9JzAgMCAxNiAxMicgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nMTYnIGhlaWdodD0nMTInIGZpbGw9JyNlNWU3ZWInLz48L3N2Zz4="
              unoptimized
            />
          </div>
        ) : null}
        {isPdf && previewUrl ? <iframe src={previewUrl} className="h-[75vh] w-full" /> : null}
        {isVideo && previewUrl ? (
          <video controls src={previewUrl} className="max-h-[75vh] w-full" />
        ) : null}
        {preview.error ? <p className="text-sm text-[var(--text-muted)]">{preview.error}</p> : null}
      </div>
    </div>
  );
}
