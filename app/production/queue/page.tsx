"use client";

export default function ProductionQueuePage() {
  // DEMO DATA (will be replaced with Firestore later)
  const queue = [
    {
      id: "PRD-001",
      project: "Corporate Website Redesign",
      client: "Brightwood Publishing",
      status: "In Progress",
      deadline: "2025-02-12",
      priority: "High",
    },
    {
      id: "PRD-002",
      project: "Social Media Creatives",
      client: "Hipster Circles",
      status: "Pending",
      deadline: "2025-02-15",
      priority: "Medium",
    },
    {
      id: "PRD-003",
      project: "Brand Identity Kit",
      client: "Zenova Health",
      status: "Completed",
      deadline: "2025-02-01",
      priority: "Low",
    },
  ];

  const statusColors: any = {
    Pending: "bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300",
    "In Progress": "bg-blue-600 text-white",
    Completed: "bg-green-600 text-white",
  };

  const priorityColors: any = {
    High: "text-red-600 dark:text-red-400",
    Medium: "text-yellow-600 dark:text-yellow-400",
    Low: "text-green-600 dark:text-green-400",
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Production Queue</h1>

      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-6 px-4 py-3 bg-gray-100 dark:bg-neutral-800 text-sm font-semibold text-gray-700 dark:text-neutral-300">
          <div>ID</div>
          <div>Project</div>
          <div>Client</div>
          <div>Status</div>
          <div>Deadline</div>
          <div>Priority</div>
        </div>

        {/* Table Rows */}
        {queue.map((task) => (
          <div
            key={task.id}
            className="grid grid-cols-6 px-4 py-4 border-t border-gray-200 dark:border-neutral-800 text-sm items-center hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition"
          >
            <div className="font-medium">{task.id}</div>
            <div>{task.project}</div>
            <div className="text-gray-600 dark:text-neutral-400">{task.client}</div>

            <div>
              <span
                className={`px-2 py-1 rounded-md text-xs font-semibold ${statusColors[task.status]}`}
              >
                {task.status}
              </span>
            </div>

            <div>{task.deadline}</div>

            <div className={`font-semibold ${priorityColors[task.priority]}`}>
              {task.priority}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-neutral-500 mt-2">
        (This is placeholder data. When backend integration starts, tasks will be fetched per role:  
        Production = Assigned Queue,  
        Admin = All Tasks,  
        AM = Project-specific view only.)
      </p>
    </div>
  );
                                                           }
