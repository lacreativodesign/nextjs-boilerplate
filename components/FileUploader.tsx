'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

const CHUNK_SIZE = 5 * 1024 * 1024;

type UploadResponse = {
  completed?: boolean;
  fileId?: string;
  error?: string;
};

/**
 * Compatibility uploader for older call sites. Uploadcare was removed; bytes now
 * flow through the authenticated, tenant-scoped managed-file API and the callback
 * receives a short-lived authorized download URL.
 */
export default function FileUploader({ onUpload }: { onUpload: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (file.size <= 0) throw new Error('Select a non-empty file.');

    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let finalResult: UploadResponse | null = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));
      const form = new FormData();
      form.append('uploadId', uploadId);
      form.append('chunkIndex', String(chunkIndex));
      form.append('totalChunks', String(totalChunks));
      form.append('fileName', file.name);
      form.append('mimeType', file.type || 'application/octet-stream');
      form.append('size', String(file.size));
      form.append('chunk', chunk);

      const response = await apiFetch('/api/files/upload', { method: 'POST', body: form });
      const result = (await response.json()) as UploadResponse;
      if (!response.ok) throw new Error(result.error || 'Upload failed.');
      finalResult = result;
      setProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
    }

    if (!finalResult?.completed || !finalResult.fileId) {
      throw new Error('Upload did not complete. Please try again.');
    }

    const downloadResponse = await apiFetch(`/api/files/${finalResult.fileId}/download`, {
      cache: 'no-store',
    });
    const download = (await downloadResponse.json()) as { downloadUrl?: string; error?: string };
    if (!downloadResponse.ok || !download.downloadUrl) {
      throw new Error(download.error || 'Unable to authorize the uploaded file.');
    }
    onUpload(download.downloadUrl);
  };

  const onSelect = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      await upload(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-[var(--border-subtle)] p-4">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(event) => void onSelect(event.target.files?.[0])}
        disabled={uploading}
      />
      <button
        type="button"
        className="btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? `Uploading ${progress}%` : 'Upload file'}
      </button>
      {uploading ? (
        <progress
          className="block w-full"
          max={100}
          value={progress}
          aria-label="Upload progress"
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
