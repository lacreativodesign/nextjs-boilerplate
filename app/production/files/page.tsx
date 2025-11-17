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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Files</h1>

      {/* Tabs */}
      <div className="flex space-x-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
              active === tab
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Upload Widget */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3">
          <Upload className="w-6 h-6 text-gray-600 dark:text-neutral-400" />
          <div>
            <p className="font-semibold">Upload File</p>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Production can upload Draft, Revision, or Final depending on the selected tab.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <input
            type="file"
            className="border border-gray-300 dark:border-neutral-700 rounded-lg p-3 w-full bg-gray-50 dark:bg-neutral-800 dark:text-neutral-300"
          />
        </div>

        <button className="mt-4 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium">
          Upload File
        </button>
      </div>

      {/* File List */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-5 px-4 py-3 bg-gray-100 dark:bg-neutral-800 text-sm font-semibold text-gray-700 dark:text-neutral-300">
          <div>ID</div>
          <div>Project</div>
          <div>File</div>
          <div>Uploaded By</div>
          <div>Date</div>
        </div>

        {sampleFiles[active].map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-5 px-4 py-4 border-t border-gray-200 dark:border-neutral-800 text-sm items-center hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition"
          >
            <div className="font-medium">{f.id}</div>
            <div>{f.project}</div>

            <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
              <FileText className="w-4 h-4" />
              <span>{f.fileName}</span>
            </div>

            <div className="text-gray-700 dark:text-neutral-300">
              {f.uploadedBy}
            </div>

            <div>{f.date}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-neutral-500 mt-2">
        (Later this will connect to Firebase Storage + Firestore and follow the Draft → Revision → Final workflow.)
      </p>
    </div>
  );
        }
