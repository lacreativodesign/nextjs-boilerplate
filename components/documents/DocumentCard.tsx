"use client";

import Image from "next/image";
import { useState } from "react";
import type { Document } from "@/types/documents";

export function DocumentCard({
  document,
  view,
  onDelete,
  selected,
  onSelect,
}: {
  document: Document;
  view: "grid" | "list";
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: (id: string, next: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/download`);
      const data = await response.json();
      if (response.ok && data.downloadUrl) {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Download error", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [document.id] }),
      });
      if (response.ok) {
        onDelete?.();
      }
    } catch (error) {
      console.error("Delete error", error);
    } finally {
      setLoading(false);
    }
  };

  const isImage = document.mimeType.startsWith("image/");
  const isPdf = document.mimeType === "application/pdf";
  const previewUrl = document.previewUrl || document.storageUrl;

  return (
    <div
      className={`border rounded-lg p-4 bg-white shadow-sm ${
        view === "list" ? "flex items-center justify-between" : "space-y-3"
      }`}
    >
      <div className={view === "list" ? "flex items-center gap-3" : "space-y-3"}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect?.(document.id, event.target.checked)}
          className="h-4 w-4"
        />

        <div className="h-20 w-20 rounded border bg-gray-50 flex items-center justify-center overflow-hidden">
          {isImage && document.previewUrl ? (
            <Image
              src={document.previewUrl}
              alt={document.originalFileName}
              width={80}
              height={80}
              className="h-full w-full object-cover"
              loading="lazy"
              sizes="80px"
              unoptimized
            />
          ) : isPdf ? (
            <span className="text-xs font-medium text-gray-600">PDF</span>
          ) : (
            <span className="text-xs font-medium text-gray-600">FILE</span>
          )}
        </div>

        <div>
          <div className="font-medium text-gray-900">{document.title || document.originalFileName}</div>
          <div className="text-xs text-gray-500">{document.category}</div>
          <div className="text-xs text-gray-500">{(document.fileSize / 1024).toFixed(1)} KB</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(isImage || isPdf) && previewUrl && (
          <button
            type="button"
            onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
            className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-800"
          >
            Preview
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-800 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
