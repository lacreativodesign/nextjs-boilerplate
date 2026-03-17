"use client";

import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";

type FileUploaderProps = {
  onUploadComplete?: (documentId: string) => void;
  category?: string;
  folderId?: string;
  visibility?: "private" | "team" | "public";
  relatedResourceType?: string;
  relatedResourceId?: string;
};

type UploadResult = {
  file: File;
  success: boolean;
  documentId?: string;
  error?: string;
};

export function FileUploader({
  onUploadComplete,
  category,
  folderId,
  visibility,
  relatedResourceType,
  relatedResourceId,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptedTypes = useMemo(
    () => [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ],
    []
  );

  const runWithConcurrency = async (files: File[], limit: number, worker: (file: File) => Promise<UploadResult>) => {
    const results: UploadResult[] = [];
    let index = 0;

    const runners = Array.from({ length: Math.min(limit, files.length) }).map(async () => {
      while (index < files.length) {
        const currentIndex = index;
        index += 1;
        const result = await worker(files[currentIndex]);
        results.push(result);
      }
    });

    await Promise.all(runners);
    return results;
  };

  const uploadFile = useCallback(
    (file: File) =>
      new Promise<UploadResult>((resolve) => {
        const formData = new FormData();
        formData.append("file", file);
        if (category) formData.append("category", category);
        if (folderId) formData.append("folderId", folderId);
        if (visibility) formData.append("visibility", visibility);
        if (relatedResourceType) formData.append("relatedResourceType", relatedResourceType);
        if (relatedResourceId) formData.append("relatedResourceId", relatedResourceId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/documents/upload", true);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            onUploadComplete?.(data.documentId);
            resolve({ file, success: true, documentId: data.documentId });
          } else {
            const data = JSON.parse(xhr.responseText || "{}");
            resolve({ file, success: false, error: data.error || "Upload failed" });
          }
        };

        xhr.onerror = () => {
          resolve({ file, success: false, error: "Upload failed" });
        };

        xhr.send(formData);
      }),
    [category, folderId, visibility, relatedResourceId, relatedResourceType, onUploadComplete]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      setError(null);
      setProgress(0);

      const validFiles = files.filter((file) => acceptedTypes.includes(file.type));
      if (validFiles.length !== files.length) {
        setError("Some files were skipped because their types are not allowed.");
      }

      const results = await runWithConcurrency(validFiles, 3, uploadFile);
      const failed = results.filter((result) => !result.success);
      if (failed.length) {
        setError(`${failed.length} file(s) failed to upload.`);
      }

      setUploading(false);
      setProgress(0);
    },
    [acceptedTypes, uploadFile]
  );

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await handleFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    await handleFiles(files);
  };

  return (
    <div
      className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition border-[var(--border-subtle)] hover:border-[var(--erp-blue)] bg-[var(--surface-card)]"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="hidden"
        accept={
          ".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        }
      />

      {uploading ? (
        <div>
          <div className="text-lg font-medium mb-2">Uploading...</div>
          <div className="w-full bg-[var(--surface-muted)] rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div>
          <svg
            className="mx-auto h-12 w-12 text-[var(--text-soft)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Drag and drop files here, or click to select</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Max file size: 50MB</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
