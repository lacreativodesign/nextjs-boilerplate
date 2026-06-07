"use client";

import { useState } from "react";
import { Upload, FileText } from "lucide-react";

export default function ProductionFilesPage() {
  const tabs = ["Draft", "Revision", "Final"] as const;
  const [active, setActive] = useState<typeof tabs[number]>("Draft");

  const sampleFiles = {
    Draft: [
      {
        id: "F-001",
        project: "Corporate Website Redesign",
        fileName: "homepage-v1.fig",
        uploadedBy: "Sarah Johnson (AM)",
        date: "2025-02-12",
      },
    ],
    Revision: [
      {
        id: "F-002",
        project: "Brand Identity Kit",
        fileName: "logo-update-rev2.ai",
        uploadedBy: "David Wilson (AM)",
        date: "2025-02-14",
      },
    ],
    Final: [
      {
        id: "F-003",
        project: "Social Media Creatives",
        fileName: "final-creatives.zip",
        uploadedBy: "Emily Carter (AM)",
        date: "2025-02-08",
      },
    ],
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Files</h1>

      <div className="tabs-bar">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`tab-pill ${active === tab ? "active" : ""}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center space-x-3">
          <Upload className="w-6 h-6 text-[var(--text-muted)]" />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Upload File</p>
            <p className="text-sm text-[var(--text-muted)]">
              Production can upload Draft, Revision, or Final depending on the selected tab.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <input type="file" className="input" />
        </div>
        <button className="btn mt-4">Upload File</button>
      </div>

      <div className="table-shell">
        <div className="grid grid-cols-5 px-4 py-3 bg-[var(--table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <div>ID</div>
          <div>Project</div>
          <div>File</div>
          <div>Uploaded By</div>
          <div>Date</div>
        </div>
        {sampleFiles[active].map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-5 px-4 py-4 border-t border-[var(--border-subtle)] text-sm items-center hover:bg-[var(--table-row-hover)] transition"
          >
            <div className="font-medium text-[var(--text-primary)]">{f.id}</div>
            <div className="text-[var(--text-primary)]">{f.project}</div>
            <div className="flex items-center space-x-2 text-[var(--erp-blue)]">
              <FileText className="w-4 h-4" />
              <span>{f.fileName}</span>
            </div>
            <div className="text-[var(--text-muted)]">{f.uploadedBy}</div>
            <div className="text-[var(--text-primary)]">{f.date}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
