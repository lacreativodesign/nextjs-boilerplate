"use client";

export default function ProductionDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-2">Welcome, Production Team 🛠️</h2>

      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Track active tasks, manage project files, and stay aligned with delivery timelines.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700 shadow-sm hover:shadow-md">
          <h3 className="text-lg font-semibold">Active Queue</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Review projects in the production pipeline and update statuses.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700 shadow-sm hover:shadow-md">
          <h3 className="text-lg font-semibold">Files Management</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Upload drafts, revisions, and final deliverables for client approval.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700 shadow-sm hover:shadow-md">
          <h3 className="text-lg font-semibold">Activity Log</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track changes, progress notes, and communication from AM & clients.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700 shadow-sm hover:shadow-md">
          <h3 className="text-lg font-semibold">Reports</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Review workload, delivery timelines, and production performance insights.
          </p>
        </div>

      </div>
    </div>
  );
      }
