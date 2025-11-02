"use client";
import React, { useState } from "react";

const queue = [
  { id:"LC-0001", title:"Acme Website", am:"Jane AM", status:"Draft", files:[{name:"home-v1.png", stage:"Draft"}] },
  { id:"LC-0002", title:"Bistro Branding", am:"Sam AM", status:"Revision", files:[{name:"logo-v2.ai", stage:"Revision"}] },
];

export default function Production(){
  const [open,setOpen]=useState<string>("LC-0001");
  const [chat,setChat]=useState<Record<string,string[]>>({
    "LC-0001":["AM: please tweak hero","PROD: on it"],
    "LC-0002":["AM: color variant?"]
  });
  const [msg,setMsg]=useState("");

  return (
    <div className="grid">
      <h2 className="h">Production Queue</h2>
      <section className="card">
        {queue.map(p=>(
          <div key={p.id} style={{padding:"10px 0",borderBottom:"1px dashed rgba(148,163,184,.3)"}}>
            <div className="row">
              <div><b>{p.title}</b> <span className="mut">({p.id})</span><div className="mut">AM: {p.am}</div></div>
              <div><span className="badge mut">{p.status}</span> <button className="btn ghost" onClick={()=>setOpen(s=> s===p.id? "":p.id)}>{open===p.id? "Hide":"Open"}</button></div>
            </div>

            {open===p.id && (
              <div className="grid" style={{marginTop:10}}>
                <div className="row" style={{gap:8}}>
                  <label className="mut">Upload</label>
                  <div style={{border:"2px dashed rgba(148,163,184,.35)",padding:10,borderRadius:12}}>
                    <input type="file" />
                  </div>
                  <select className="input" defaultValue="Draft"><option>Draft</option><option>Revision</option><option>Final</option></select>
                  <button className="btn">Save</button>
                </div>

                <div className="mut">Files:</div>
                <ul>
                  {p.files.map((f,i)=><li key={i}>📄 {f.name} — <span className="badge">{f.stage}</span></li>)}
                </ul>

                <div className="mut">Chat:</div>
                <div style={{background:"rgba(255,255,255,.02)",padding:10,borderRadius:12, maxHeight:180,overflow:"auto",border:"1px solid rgba(255,255,255,.12)"}}>
                  {(chat[p.id]||[]).map((c,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:i%2?"flex-end":"flex-start",margin:"6px 0"}}>
                      <div style={{background:i%2?"#06B6D4":"#6366F1",color:"#fff",padding:"8px 10px",borderRadius:12,maxWidth:360}}>{c}</div>
                    </div>
                  ))}
                </div>
                <div className="row" style={{gap:8}}>
                  <input className="input" placeholder="Message…" value={msg} onChange={e=>setMsg(e.target.value)} />
                  <button className="btn" onClick={()=>{
                    if(!msg) return;
                    setChat(prev=> ({...prev, [p.id]: [...(prev[p.id]||[]), `PROD: ${msg}`]}));
                    setMsg("");
                  }}>Send</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
