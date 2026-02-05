"use client";
import { useEffect, useState } from "react";
import FileUploader from "@/components/FileUploader";

export default function ProductionProjectDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const load = async () => setData(await fetch(`/api/projects/${params.id}`, { credentials: "include", cache: "no-store" }).then(r=>r.json()));
  useEffect(() => { load(); }, [params.id]);
  return <div className="space-y-4"><h1 className="page-title">Project Workspace</h1>{data?.project && <div className="card p-4 space-y-3">
    <div>{data.project.title} · {data.project.status}</div>
    <div className="grid md:grid-cols-2 gap-2">{['draft','revision'].map((type)=><div key={type}><div className="text-xs mb-1">Upload {type}</div><FileUploader onUpload={async (fileUrl:string)=>{await fetch('/api/projects/files',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({projectId:params.id,type,fileUrl})});load();}} /></div>)}</div>
    <div className="space-y-2"><div className="font-medium">Messages</div><div className="max-h-48 overflow-auto border rounded p-2">{(data.messages||[]).map((m:any)=><div key={m.id} className="text-sm">{m.senderRole}: {m.message}</div>)}</div><div className="flex gap-2"><input className="input" value={message} onChange={e=>setMessage(e.target.value)} /><button className="btn" onClick={async()=>{await fetch('/api/projects/messages',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({projectId:params.id,message})});setMessage('');load();}}>Send</button></div></div>
  </div>}</div>;
}
