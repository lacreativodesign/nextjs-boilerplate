'use client';

import Link from 'next/link';

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
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="card block p-4 transition hover:shadow-[var(--shadow-lift)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{project.name}</h3>
        <span className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-xs uppercase text-[var(--text-muted)]">
          {project.status}
        </span>
      </div>
      <p className="mb-3 text-sm text-[var(--text-muted)]">{project.code}</p>
      <div className="mb-3 h-2 w-full rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-2 rounded bg-blue-600"
          style={{ width: `${Math.max(0, Math.min(project.progress || 0, 100))}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-[var(--text-muted)]">
        <span>
          {project.completedTasks}/{project.totalTasks} tasks
        </span>
        <span>{project.managerName}</span>
      </div>
    </Link>
  );
}
