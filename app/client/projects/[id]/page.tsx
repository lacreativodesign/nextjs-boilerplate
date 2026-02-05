"use client";
import { useEffect, useState } from "react";

export default function ClientProjectDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [description, setDescription] = useState("");
  const load = async () => setData(await fetch(`/api/projects/${params.id}`, { credentials: "include", cache: "no-store" }).then(r=>r.json()));
  useEffect(() => { load(); }, [params.id]);
  return <div className="space-y-4"><h1 className="page-title">Project Portal</h1>{data?.project && <div className="card p-4 space-y-3">
    <div>{data.project.title} · {data.project.status}</div>
    <div className="space-y-1"><div className="font-medium">Files</div>{(data.files||[]).map((f:any)=><a key={f.id} href={f.fileUrl} className="text-sm underline block" target="_blank">{f.type} file</a>)}</div>
    <div className="space-y-1"><div className="font-medium">Messages</div>{(data.messages||[]).map((m:any)=><div key={m.id} className="text-sm">{m.senderRole}: {m.message}</div>)}</div>
    <div className="space-y-2"><div className="font-medium">Request Change</div><textarea className="input min-h-24" value={description} onChange={e=>setDescription(e.target.value)} /><button className="btn" onClick={async()=>{await fetch('/api/projects/change-requests',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({projectId:params.id,description})});setDescription('');load();}}>Submit</button></div>
  </div>}</div>;
}
