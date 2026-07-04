'use client';

import { useEffect, useState } from 'react';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import { ProjectCard } from '@/components/projects/ProjectCard';
import EmptyState from '@/components/ui/EmptyState';

type Project = {
  id: string;
  name: string;
  code: string;
  status: string;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  managerName: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);

      const response = await fetch(`/api/projects?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      setProjects(data.projects || []);
    } catch {
      setError('Unable to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title">Projects</h1>
        <CreateProjectDialog onSuccess={fetchProjects} />
      </div>

      <div className="mb-6 flex gap-2 border-b">
        {['all', 'planning', 'active', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`tab-pill ${filter === status ? 'active' : ''}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : error ? (
        <EmptyState title="Something went wrong" description={error} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start tracking delivery."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
