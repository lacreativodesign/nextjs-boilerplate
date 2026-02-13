"use client";

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
        {isImage && file.previewUrl ? <img src={file.previewUrl} alt={file.name} className="max-h-[75vh]" /> : null}
        {isPdf && file.previewUrl ? <iframe src={file.previewUrl} className="h-[75vh] w-full" /> : null}
        {isVideo && file.previewUrl ? <video controls src={file.previewUrl} className="max-h-[75vh] w-full" /> : null}
      </div>
    </div>
  );
}
