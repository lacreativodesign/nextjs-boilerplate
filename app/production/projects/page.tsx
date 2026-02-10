"use client";

import { useEffect, useState } from "react";
import { TableSkeleton } from "@/components/ui/Skeleton";

export default function ProductionProjectsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 600);
    return () => window.clearTimeout(timer);
  }, []);
  const projects = [
    {
      id: "P-001",
      name: "Corporate Website Redesign",
      client: "Brightwood Publishing",
      stage: "Draft Submitted",
      accountManager: "Sarah Johnson",
      due: "2025-02-18",
    },
    {
      id: "P-002",
      name: "Brand Identity Kit",
      client: "Zenova Health",
      stage: "In Production",
      accountManager: "David Wilson",
      due: "2025-02-22",
    },
    {
      id: "P-003",
      name: "Social Media Creatives",
      client: "Hipster Circles",
      stage: "Awaiting Review",
      accountManager: "Emily Carter",
      due: "2025-02-10",
    },
  ];

  const stageColors: any = {
    "Draft Submitted": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    "In Production": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    "Awaiting Review": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    Completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Projects</h1>

      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-6 px-4 py-3 bg-gray-100 dark:bg-neutral-800 text-sm font-semibold text-gray-700 dark:text-neutral-300">
          <div>ID</div>
          <div>Project</div>
          <div>Client</div>
          <div>AM</div>
          <div>Status</div>
          <div>Due Date</div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="px-4 py-4">
            <TableSkeleton rows={3} columns={6} />
          </div>
        ) : projects.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-6 px-4 py-4 border-t border-gray-200 dark:border-neutral-800 text-sm items-center hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition"
          >
            <div className="font-medium">{p.id}</div>

            <div>{p.name}</div>

            <div className="text-gray-600 dark:text-neutral-400">
              {p.client}
            </div>

            <div className="text-gray-700 dark:text-neutral-300">
              {p.accountManager}
            </div>

            <div>
              <span
                className={`px-2 py-1 rounded-md text-xs font-semibold ${stageColors[p.stage]}`}
              >
                {p.stage}
              </span>
            </div>

            <div>{p.due}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-neutral-500 mt-2">
        (This is placeholder UI. Later, Production will only see their assigned projects.  
        Admin sees all. AM sees their clients’ projects only.)
      </p>
    </div>
  );
                                                   }
