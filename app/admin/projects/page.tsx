"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Project = { id: string; title: string; status: string; assignedAM?: string | null; assignedProduction?: string | null };

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  async function load() {
    const [pRes, uRes] = await Promise.all([
      fetch("/api/projects", { cache: "no-store", credentials: "include" }),
      fetch("/api/admin/users?limit=200", { cache: "no-store", credentials: "include" }).catch(() => null as any),
    ]);
    const p = await pRes.json();
    setProjects(p.projects || []);
    const u = uRes ? await uRes.json().catch(() => ({})) : {};
    setUsers(u.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function assign(projectId: string, assignedAM: string, assignedProduction: string) {
    await fetch("/api/projects/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ projectId, assignedAM, assignedProduction }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Projects</h1>
      <div className="card p-4 space-y-3">
        {projects.map((project) => (
          <div key={project.id} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{project.title}</div>
                <div className="text-xs text-[var(--text-muted)]">Status: {project.status}</div>
              </div>
              <Link href={`/admin/projects/${project.id}`} className="btn btn-sm">Open</Link>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <select defaultValue={project.assignedAM || ""} onChange={(e) => assign(project.id, e.target.value, project.assignedProduction || "")} className="input">
                <option value="">Assign AM</option>
                {users.filter((u) => ["am"].includes(String(u.role))).map((u) => <option key={u.uid} value={u.uid}>{u.name || u.email || u.uid}</option>)}
              </select>
              <select defaultValue={project.assignedProduction || ""} onChange={(e) => assign(project.id, project.assignedAM || "", e.target.value)} className="input">
                <option value="">Assign Production</option>
                {users.filter((u) => ["production"].includes(String(u.role))).map((u) => <option key={u.uid} value={u.uid}>{u.name || u.email || u.uid}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
