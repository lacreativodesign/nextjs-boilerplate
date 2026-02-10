"use client";

import { useEffect, useState } from "react";
import { TaskBoard } from "@/components/projects/TaskBoard";
import { TimeTracker } from "@/components/projects/TimeTracker";

type Project = {
  id: string;
  name: string;
  code: string;
  progress: number;
  completedTasks: number;
  totalTasks: number;
};

type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "blocked" | "completed" | "cancelled";
  priority: string;
  assignedToName?: string;
};

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"board" | "list">("board");

  const fetchProject = async () => {
    const response = await fetch(`/api/projects/${params.id}`);
    const data = await response.json();
    setProject(data.project ?? null);
  };

  const fetchTasks = async () => {
    const response = await fetch(`/api/projects/${params.id}/tasks`);
    const data = await response.json();
    setTasks(data.tasks || []);
  };

  useEffect(() => {
    void fetchProject();
    void fetchTasks();
  }, [params.id]);

  if (!project) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <div className="mt-2 flex gap-4 text-sm text-gray-600">
          <span>Code: {project.code}</span>
          <span>Progress: {project.progress}%</span>
          <span>
            {project.completedTasks}/{project.totalTasks} tasks completed
          </span>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <button onClick={() => setView("board")} className={`rounded px-4 py-2 ${view === "board" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Board
        </button>
        <button onClick={() => setView("list")} className={`rounded px-4 py-2 ${view === "list" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          List
        </button>
      </div>

      {view === "board" ? (
        <TaskBoard projectId={params.id} tasks={tasks} onUpdate={fetchTasks} />
      ) : (
        <div className="rounded border">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-b-0">
              <span>{task.title}</span>
              <span className="text-gray-500">{task.status}</span>
            </div>
          ))}
        </div>
      )}

      <TimeTracker projectId={params.id} projectName={project.name} />
    </div>
  );
}
