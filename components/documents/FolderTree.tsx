"use client";

import { useEffect, useState } from "react";
import type { Folder } from "@/types/documents";

function FolderNode({
  folder,
  currentFolder,
  onFolderSelect,
}: {
  folder: Folder;
  currentFolder: string | null;
  onFolderSelect: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/folders?parentId=${folder.id}`);
      const data = await response.json();
      setChildren(data.folders || []);
    } catch (error) {
      console.error("Failed to load folders", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = async () => {
    if (!expanded) {
      await loadChildren();
    }
    setExpanded((prev) => !prev);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="text-xs text-gray-500"
          aria-label={expanded ? "Collapse folder" : "Expand folder"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          onClick={() => onFolderSelect(folder.id)}
          className={`text-sm ${currentFolder === folder.id ? "font-semibold text-blue-600" : "text-gray-700"}`}
        >
          {folder.name}
        </button>
      </div>
      {expanded && (
        <div className="ml-4 space-y-2">
          {loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (
            children.map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                currentFolder={currentFolder}
                onFolderSelect={onFolderSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  currentFolder,
  onFolderSelect,
}: {
  currentFolder: string | null;
  onFolderSelect: (id: string | null) => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    const loadRoots = async () => {
      try {
        const response = await fetch("/api/folders");
        const data = await response.json();
        setFolders(data.folders || []);
      } catch (error) {
        console.error("Failed to load root folders", error);
      }
    };

    loadRoots();
  }, []);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onFolderSelect(null)}
        className={`text-sm ${currentFolder === null ? "font-semibold text-blue-600" : "text-gray-700"}`}
      >
        All Documents
      </button>
      <div className="space-y-2">
        {folders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            currentFolder={currentFolder}
            onFolderSelect={onFolderSelect}
          />
        ))}
      </div>
    </div>
  );
}
