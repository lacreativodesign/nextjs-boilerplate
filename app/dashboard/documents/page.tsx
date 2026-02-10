"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUploader } from "@/components/documents/FileUploader";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { FolderTree } from "@/components/documents/FolderTree";
import type { Document, Folder } from "@/types/documents";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFolderId, setBulkFolderId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const selectedCount = selectedIds.size;

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const filters = [] as Array<{ field: string; operator: string; value: unknown }>;

      if (currentFolder) {
        filters.push({ field: "folderId", operator: "equals", value: currentFolder });
      }
      if (categoryFilter) {
        filters.push({ field: "category", operator: "equals", value: categoryFilter });
      }
      if (tagFilter) {
        filters.push({ field: "tags", operator: "contains", value: tagFilter });
      }

      const response = await fetch("/api/documents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchText: searchText || undefined,
          filters,
          page: 1,
          limit: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      });

      const data = await response.json();
      setDocuments(data.results || []);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, currentFolder, searchText, tagFilter]);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch("/api/folders");
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch folders", error);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleUploadComplete = () => {
    fetchDocuments();
  };

  const toggleSelect = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const updated = new Set(prev);
      if (next) {
        updated.add(id);
      } else {
        updated.delete(id);
      }
      return updated;
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedCount) return;
    await fetch("/api/documents/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    fetchDocuments();
  };

  const handleBulkMove = async (folderId: string | null) => {
    if (!selectedCount) return;
    await fetch("/api/documents/bulk-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds: Array.from(selectedIds), folderId }),
    });
    setSelectedIds(new Set());
    setBulkFolderId("");
    fetchDocuments();
  };

  const folderOptions = useMemo(() => folders.map((folder) => ({ id: folder.id, name: folder.name })), [folders]);

  return (
    <div className="flex h-full">
      <div className="w-72 border-r p-4">
        <h2 className="font-bold mb-4">Folders</h2>
        <FolderTree currentFolder={currentFolder} onFolderSelect={setCurrentFolder} />
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FileUploader onUploadComplete={handleUploadComplete} folderId={currentFolder || undefined} />
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search by name or description"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <div className="flex gap-3">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-1/2 border rounded px-3 py-2"
              >
                <option value="">All Categories</option>
                <option value="invoice">Invoice</option>
                <option value="receipt">Receipt</option>
                <option value="contract">Contract</option>
                <option value="proposal">Proposal</option>
                <option value="report">Report</option>
                <option value="statement">Statement</option>
                <option value="tax_document">Tax Document</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="marketing">Marketing</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                placeholder="Tag"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="w-1/2 border rounded px-3 py-2"
              />
            </div>
            <button
              type="button"
              onClick={fetchDocuments}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Documents</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1 rounded ${view === "grid" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1 rounded ${view === "list" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            >
              List
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-gray-50 border rounded p-3">
          <span className="text-sm text-gray-600">Selected: {selectedCount}</span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={!selectedCount}
            className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50"
          >
            Delete Selected
          </button>
          <select
            value={bulkFolderId}
            onChange={(event) => setBulkFolderId(event.target.value)}
            className="border rounded px-3 py-1"
            disabled={!selectedCount}
          >
            <option value="">Move to folder...</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
            <option value="none">No folder</option>
          </select>
          <button
            type="button"
            onClick={() => handleBulkMove(bulkFolderId === "none" ? null : bulkFolderId || null)}
            disabled={!selectedCount || bulkFolderId === ""}
            className="px-3 py-1 rounded bg-gray-200 text-gray-800 disabled:opacity-50"
          >
            Move Selected
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading documents...</p>
        ) : (
          <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}>
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                view={view}
                selected={selectedIds.has(doc.id)}
                onSelect={toggleSelect}
                onDelete={fetchDocuments}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
