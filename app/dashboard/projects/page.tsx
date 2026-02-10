"use client";

import { useEffect, useState } from "react";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";

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
  const [filter, setFilter] = useState("active");

  const fetchProjects = async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.append("status", filter);

    const response = await fetch(`/api/projects?${params.toString()}`);
    const data = await response.json();
    setProjects(data.projects || []);
  };

  useEffect(() => {
    void fetchProjects();
  }, [filter]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <CreateProjectDialog onSuccess={fetchProjects} />
      </div>

      <div className="mb-6 flex gap-2 border-b">
        {["all", "planning", "active", "completed"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 font-medium ${
              filter === status ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
