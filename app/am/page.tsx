"use client";
import React, { useState } from "react";

const myClients = [
  { id:"LC-0001", name:"Acme Co", service:"Website", stage:"Review" },
  { id:"LC-0002", name:"Bistro Ltd", service:"Branding", stage:"Kickoff" },
];

export default function AM(){
  const [thread,setThread] = useState<string[]>(["AM → Client: Welcome aboard!"]);
  const [msg,setMsg] = useState("");

  return (
    <div className="grid">
      <h2 className="h">My Accounts</h2>
      <section className="card">
        <table className="table">
          <thead><tr><th>Order ID</th><th>Client</th><th>Service</th><th>Status</th></tr></thead>
          <tbody>
            {myClients.map(c=>(
              <tr key={c.id}><td className="tag">{c.id}</td><td>{c.name}</td><td>{c.service}</td><td>{c.stage}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3 className="h">Client Thread (iMessage style)</h3>
        <div style={{background:"rgba(255,255,255,.02)",padding:10,borderRadius:12,maxHeight:220,overflow:"auto",border:"1px solid rgba(255,255,255,.12)"}}>
          {thread.map((t,i)=>(
            <div key={i} style={{display:"flex",justifyContent: i%2? "flex-end":"flex-start", margin:"6px 0"}}>
              <div style={{background: i%2? "#06B6D4":"#6366F1", color:"#fff", padding:"8px 10px", borderRadius:12, maxWidth:360}}>
                {t} <span style={{opacity:.7,fontSize:11,marginLeft:8}}>10:4{i}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{gap:8, marginTop:8}}>
          <input className="input" placeholder="Type…" value={msg} onChange={e=>setMsg(e.target.value)} />
          <button className="btn" onClick={()=>{ if(!msg) return; setThread(prev=>[...prev, `AM: ${msg}`]); setMsg(""); }}>Send</button>
        </div>
      </section>
    </div>
  );
}
