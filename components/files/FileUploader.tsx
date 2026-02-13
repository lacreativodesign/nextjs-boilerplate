"use client";

import { useRef, useState } from "react";

const CHUNK_SIZE = 5 * 1024 * 1024;

export function FileUploader({ folderId, onCompleted }: { folderId?: string; onCompleted: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File) => {
    const uploadId = `${Date.now()}-${crypto.randomUUID()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);

      const form = new FormData();
      form.append("uploadId", uploadId);
      form.append("chunkIndex", String(chunkIndex));
      form.append("totalChunks", String(totalChunks));
      form.append("fileName", file.name);
      form.append("mimeType", file.type || "application/octet-stream");
      form.append("size", String(file.size));
      if (folderId) form.append("folderId", folderId);
      form.append("chunk", chunk);

      const res = await fetch("/api/files/upload", { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Upload failed");
      }

      setProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
    }
  };

  const onSelectFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);

    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
      onCompleted();
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">File uploader</h3>
        <button className="btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
          Upload files
        </button>
      </div>
      <input ref={inputRef} className="hidden" type="file" multiple onChange={(e) => onSelectFiles(e.target.files)} />
      {uploading && (
        <div className="w-full rounded bg-gray-100">
          <div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="text-xs text-gray-500">Supports chunked uploads for large files.</p>
    </div>
  );
}
