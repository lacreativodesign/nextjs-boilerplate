"use client";

import { useEffect, useState } from "react";
import { FileUploader } from "@/components/files/FileUploader";
import { FolderTreeNavigation } from "@/components/files/FolderTreeNavigation";
import { FileBrowser } from "@/components/files/FileBrowser";
import { FilePreviewModal } from "@/components/files/FilePreviewModal";
import { VersionHistoryViewer } from "@/components/files/VersionHistoryViewer";
import { TagManager } from "@/components/files/TagManager";
import { ShareLinkGenerator } from "@/components/files/ShareLinkGenerator";
import { PermissionSelector } from "@/components/files/PermissionSelector";

type FileRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  tags: string[];
  latestVersion: number;
  previewUrl?: string;
};

export default function DocumentsPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folderId, setFolderId] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<FileRecord | undefined>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versionFileId, setVersionFileId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "team" | "public">("private");

  const loadFiles = async () => {
    const params = new URLSearchParams();
    if (folderId) params.set("folderId", folderId);
    const res = await fetch(`/api/files?${params.toString()}`, { cache: "no-store" });
    const payload = await res.json();
    setFiles(payload.files || []);
  };

  useEffect(() => {
    void loadFiles();
  }, [folderId]);

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName,
        parentFolderId: folderId,
        visibility,
      }),
    });

    if (res.ok) {
      setNewFolderName("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Documents</h1>
        <p className="page-subtitle">Manage files, folders, uploads, and shared documents.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <FolderTreeNavigation currentFolderId={folderId} onSelect={setFolderId} />

          <div className="card space-y-3">
            <h3 className="text-sm font-semibold">Create folder</h3>
            <input className="input" placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
            <PermissionSelector value={visibility} onChange={setVisibility} />
            <button className="btn" onClick={createFolder}>Create</button>
          </div>
        </div>

        <div className="space-y-4">
          <FileUploader folderId={folderId} onCompleted={loadFiles} />

          <FileBrowser
            files={files}
            onOpenPreview={(file) => {
              setSelectedFile(file);
              setPreviewOpen(true);
            }}
            onOpenVersions={(fileId) => setVersionFileId(fileId)}
            onRefresh={loadFiles}
          />

          {selectedFile ? (
            <div className="card space-y-3">
              <TagManager fileId={selectedFile.id} onUpdated={loadFiles} />
              <ShareLinkGenerator fileId={selectedFile.id} />
            </div>
          ) : null}

          {versionFileId ? <VersionHistoryViewer fileId={versionFileId} onRestored={loadFiles} /> : null}
        </div>
      </div>

      <FilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        file={
          selectedFile
            ? {
                name: selectedFile.name,
                mimeType: selectedFile.mimeType,
                previewUrl: selectedFile.previewUrl,
              }
            : undefined
        }
      />
    </div>
  );
}
