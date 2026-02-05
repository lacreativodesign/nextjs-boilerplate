"use client";
import { useEffect, useState } from "react";

const STAGES = ["inquiry","deposit","kickoff","draft","review","revisions","final","delivered"];

export default function AdminProjectDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const load = async () => setData(await fetch(`/api/projects/${params.id}`, { credentials: "include", cache: "no-store" }).then(r=>r.json()));
  useEffect(() => { load(); }, [params.id]);
  return <div className="space-y-4"><h1 className="page-title">Project Control</h1>{data?.project && <div className="card p-4 space-y-3">
    <div>{data.project.title} · {data.project.status}</div>
    <select className="input" defaultValue={data.project.status} onChange={async(e)=>{await fetch('/api/projects/status',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({projectId:params.id,status:e.target.value,adminOverride:true})});load();}}>{STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select>
    <div className="space-y-1"><div className="font-medium">Files (read-only)</div>{(data.files||[]).map((f:any)=><a key={f.id} href={f.fileUrl} className="text-sm underline block" target="_blank">{f.type} · {f.fileUrl}</a>)}</div>
    <div className="space-y-1"><div className="font-medium">Messages (read-only)</div>{(data.messages||[]).map((m:any)=><div key={m.id} className="text-sm">{m.senderRole}: {m.message}</div>)}</div>
  </div>}</div>;
}
