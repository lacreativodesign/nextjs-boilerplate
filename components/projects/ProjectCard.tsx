"use client";

import Link from "next/link";

type ProjectCardProps = {
  project: {
    id: string;
    name: string;
    code: string;
    status: string;
    progress: number;
    totalTasks: number;
    completedTasks: number;
    managerName: string;
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/dashboard/projects/${project.id}`} className="block rounded border bg-white p-4 shadow-sm transition hover:shadow">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{project.name}</h3>
        <span className="rounded bg-gray-100 px-2 py-1 text-xs uppercase">{project.status}</span>
      </div>
      <p className="mb-3 text-sm text-gray-600">{project.code}</p>
      <div className="mb-3 h-2 w-full rounded bg-gray-100">
        <div className="h-2 rounded bg-blue-600" style={{ width: `${Math.max(0, Math.min(project.progress || 0, 100))}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>
          {project.completedTasks}/{project.totalTasks} tasks
        </span>
        <span>{project.managerName}</span>
      </div>
    </Link>
  );
}
