"use client";

import { useState } from "react";
import { Clock, Filter, Search, UserCircle2, CheckCircle2, AlertTriangle } from "lucide-react";

type ActivityItem = {
  id: string;
  project: string;
  user: string;
  role: string;
  action: string;
  status: "In Progress" | "Completed" | "Delayed";
  timestamp: string;
};

const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: "A-001",
    project: "Corporate Website Redesign",
    user: "Ali Raza",
    role: "Designer",
    action: "Uploaded Draft homepage-v2.fig",
    status: "In Progress",
    timestamp: "2025-02-15 10:24",
  },
  {
    id: "A-002",
    project: "Brand Identity Kit",
    user: "Sara Khan",
    role: "Brand Designer",
    action: "Marked logo-update-rev2.ai as Final",
    status: "Completed",
    timestamp: "2025-02-15 09:02",
  },
  {
    id: "A-003",
    project: "Social Media Creatives",
    user: "Imran Ali",
    role: "Motion Artist",
    action: "Requested revision on reel-animation-v1.mp4",
    status: "Delayed",
    timestamp: "2025-02-14 17:40",
  },
  {
    id: "A-004",
    project: "E-commerce Landing Page",
    user: "Fatima Noor",
    role: "Frontend Dev",
    action: "Pushed code to production-preview branch",
    status: "In Progress",
    timestamp: "2025-02-14 15:10",
  },
];

const STATUS_COLORS: Record<ActivityItem["status"], string> = {
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Delayed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const STATUS_ICON: Record<ActivityItem["status"], JSX.Element> = {
  "In Progress": <Clock className="w-3 h-3" />,
  Completed: <CheckCircle2 className="w-3 h-3" />,
  Delayed: <AlertTriangle className="w-3 h-3" />,
};

export default function ProductionActivityPage() {
  const [statusFilter, setStatusFilter] = useState<"All" | ActivityItem["status"]>("All");
  const [search, setSearch] = useState("");

  const filtered = MOCK_ACTIVITY.filter((item) => {
    const statusOk = statusFilter === "All" || item.status === statusFilter;
    const text = (item.project + item.user + item.action).toLowerCase();
    const searchOk = !search || text.includes(search.toLowerCase());
    return statusOk && searchOk;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Live view of what the Production team is working on across all projects.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search project or team member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 text-sm bg-white dark:bg-neutral-900 text-gray-800 dark:text-neutral-100 w-full sm:w-72"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
            <div className="flex gap-1">
              {["All", "In Progress", "Completed", "Delayed"].map((label) => (
                <button
                  key={label}
                  onClick={() =>
                    setStatusFilter(label as "All" | ActivityItem["status"])
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    statusFilter === label
                      ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                      : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline card */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600 dark:text-neutral-300" />
            <div>
              <p className="text-sm font-semibold">Production Activity Feed</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Sorted by latest events first.
              </p>
            </div>
          </div>
          <span className="text-xs text-gray-400 dark:text-neutral-500">
            (Dummy data for now — later we connect to Firestore logs.)
          </span>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-500 dark:text-neutral-400 text-center">
              No activity matches your filters.
            </div>
          )}

          {filtered.map((item) => (
            <div key={item.id} className="px-5 py-4 flex gap-4">
              {/* Timeline dot */}
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-black dark:bg-white" />
                <div className="flex-1 w-px bg-gray-200 dark:bg-neutral-800 mt-1" />
              </div>

              {/* Content */}
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                    <span className="text-sm font-medium">
                      {item.user}{" "}
                      <span className="text-xs text-gray-500 dark:text-neutral-400">
                        ({item.role})
                      </span>
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLORS[item.status]}`}
                  >
                    {STATUS_ICON[item.status]}
                    {item.status}
                  </span>
                </div>

                <p className="text-sm text-gray-800 dark:text-neutral-100">
                  {item.action}
                </p>

                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  Project: <span className="font-medium">{item.project}</span>
                </p>

                <p className="text-xs text-gray-400 dark:text-neutral-500">
                  {item.timestamp}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
    }
