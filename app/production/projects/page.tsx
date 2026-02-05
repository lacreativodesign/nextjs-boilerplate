"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Project = { id: string; title: string; status: string };

export default function ProductionProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { fetch('/api/projects', {credentials:'include', cache:'no-store'}).then(r=>r.json()).then(d=>setProjects(d.projects||[])); }, []);
  return <div className="space-y-4"><h1 className="page-title">Assigned Projects</h1><div className="card p-4 space-y-2">{projects.map(p=><div key={p.id} className="flex justify-between border rounded p-2"><div>{p.title} · {p.status}</div><Link href={`/production/projects/${p.id}`} className="btn btn-sm">Open</Link></div>)}</div></div>;
}
