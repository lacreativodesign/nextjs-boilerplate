"use client";

import Image from "next/image";

export function FilePreviewModal({ open, onClose, file }: { open: boolean; onClose: () => void; file?: { name: string; mimeType: string; previewUrl?: string } }) {
  if (!open || !file) return null;

  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";
  const isVideo = file.mimeType.startsWith("video/");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-[90vw] overflow-auto rounded bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">{file.name}</h3>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
        {isImage && file.previewUrl ? (
          <div className="relative h-[75vh] w-full">
            <Image
              src={file.previewUrl}
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
        {isPdf && file.previewUrl ? <iframe src={file.previewUrl} className="h-[75vh] w-full" /> : null}
        {isVideo && file.previewUrl ? <video controls src={file.previewUrl} className="max-h-[75vh] w-full" /> : null}
      </div>
    </div>
  );
}
