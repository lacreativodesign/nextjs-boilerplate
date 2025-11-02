"use client";
import React, { useState } from "react";

const leadsInit = [
  { id:"L-101", name:"Acme Co", email:"ceo@acme.com", status:"New", amount:3000, notes:[] as string[] },
  { id:"L-102", name:"Bistro Ltd", email:"hello@bistro.io", status:"Follow-up", amount:1200, notes:["Called Tues 2pm"] },
];

export default function Sales(){
  const [leads,setLeads] = useState(leadsInit);
  const [comment,setComment] = useState("");

  return (
    <div className="grid">
      <h2 className="h">Overview</h2>
      <div className="kpis">
        <div className="card kpi"><div className="mut">Target</div><div className="v">$15,000</div></div>
        <div className="card kpi"><div className="mut">Closed (mo)</div><div className="v">$4,200</div></div>
        <div className="card kpi"><div className="mut">Conversion</div><div className="v">17%</div></div>
        <div className="card kpi"><div className="mut">Leads</div><div className="v">{leads.length}</div></div>
      </div>

      <section className="card">
        <div className="row"><h3 className="h">Leads</h3><button className="btn" onClick={()=>alert("Add new lead (demo)")}>Add Lead</button></div>
        <table className="table">
          <thead><tr><th>ID</th><th>Company</th><th>Email</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead>
          <tbody>
          {leads.map(l=>(
            <tr key={l.id}>
              <td className="tag">{l.id}</td>
              <td>{l.name}</td>
              <td>{l.email}</td>
              <td>
                <select className="input" defaultValue={l.status} onChange={e=>{
                  setLeads(prev=> prev.map(x=> x.id===l.id? {...x, status:e.target.value}:x));
                }}>
                  <option>New</option><option>Follow-up</option><option>Qualified</option><option>Won</option><option>Lost</option>
                </select>
              </td>
              <td>${l.amount.toLocaleString()}</td>
              <td>
                <button className="btn ghost" onClick={()=>alert("Payment link created (demo)")}>Create Payment Link</button>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3 className="h">Lead Notes (select any row first in real build)</h3>
        <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
          <textarea className="input" style={{height:120}} placeholder="Type a note..." value={comment} onChange={e=>setComment(e.target.value)} />
          <div>
            <button className="btn" onClick={()=>{ if(!comment) return; setLeads(prev=> prev.map(l=> l.id==="L-101"? {...l, notes:[...l.notes, comment]}:l)); setComment("");}}>Add to L-101</button>
            <div className="mut" style={{marginTop:10}}>Recent:</div>
            <ul>{leads[0].notes.map((n,i)=><li key={i}>• {n}</li>)}</ul>
          </div>
        </div>
      </section>
    </div>
  );
}
