// app/admin/page.tsx
"use client";
import React, { useMemo } from "react";

export default function AdminPage(){
  const data = useMemo(()=>({
    revenue: 128500, tasks: 34, projects: 18,
    salesSeries: [45,56,49,62,58,70],
    projects: [
      {id:"LC-0007", title:"Corporate Website", client:"Northbridge", status:"Review", budget:9000, am:"Sarah"},
      {id:"LC-0008", title:"Branding Sprint", client:"Evercrest", status:"Draft", budget:4500, am:"Dani"},
      {id:"LC-0011", title:"SEO Retainer", client:"Acme Inc", status:"In Progress", budget:2200, am:"Musa"},
    ],
    invoices: [
      {id:"INV-1024", client:"Northbridge", project:"Corporate Website", amount:3000, status:"Due"},
      {id:"INV-1025", client:"Evercrest", project:"Branding Sprint", amount:1200, status:"Paid"},
      {id:"INV-1026", client:"Acme Inc", project:"SEO Retainer", amount:800, status:"Paid"},
    ]
  }),[]);

  return (
    <div>
      <div className="top">
        <div>
          <h1 style={{margin:"6px 0"}}>Admin • Overview</h1>
          <span className="chip">LAC-ADMIN-LOCKED-2025.10.24-v1.0</span>
        </div>
        <div className="search"><input placeholder="Search clients, orders, AMs..." /></div>
      </div>

      <div className="kpis">
        <div className="card"><div style={{color:"#94A3B8",fontSize:12}}>Revenue (YTD)</div><div style={{fontWeight:900,fontSize:22}}>${(data.revenue).toLocaleString()}</div></div>
        <div className="card"><div style={{color:"#94A3B8",fontSize:12}}>Open Tasks</div><div style={{fontWeight:900,fontSize:22}}>{data.tasks}</div></div>
        <div className="card"><div style={{color:"#94A3B8",fontSize:12}}>Active Projects</div><div style={{fontWeight:900,fontSize:22}}>{data.projects.length}</div></div>
      </div>

      <div className="panelGrid" style={{marginTop:12}}>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{margin:0}}>Sales (6 mo)</h3><div className="mut">demo data</div>
          </div>
          <LineChart data={data.salesSeries} width={680} height={160} />
        </div>
        <div className="card">
          <h3 style={{marginTop:0}}>Tasks Distribution</h3>
          <BarChart labels={["Todo","In Progress","Blocked","Done"]} values={[8,12,3,17]} width={320} height={160}/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12}}>
        <div className="card">
          <h3 style={{marginTop:0}}>Recent Projects</h3>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr><th align="left">Order</th><th align="left">Title</th><th align="left">Client</th><th align="left">AM</th><th align="left">Status</th><th align="right">Budget</th></tr></thead>
            <tbody>
              {data.projects.map(p=>(
                <tr key={p.id} style={{borderTop:"1px dashed rgba(148,163,184,.3)"}}>
                  <td>{p.id}</td><td>{p.title}</td><td>{p.client}</td><td>{p.am}</td><td>{p.status}</td><td align="right">${p.budget.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{marginTop:0}}>Invoices</h3>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr><th align="left">ID</th><th align="left">Client</th><th align="left">Project</th><th align="right">Amount</th><th align="left">Status</th></tr></thead>
            <tbody>
              {data.invoices.map(i=>(
                <tr key={i.id} style={{borderTop:"1px dashed rgba(148,163,184,.3)"}}>
                  <td>{i.id}</td><td>{i.client}</td><td>{i.project}</td>
                  <td align="right">${i.amount.toLocaleString()}</td>
                  <td style={{color: i.status==="Paid" ? "#10B981":"#F59E0B"}}>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Minimal inline charts (no external libs) */
function LineChart({ data=[], width=600, height=140, stroke="#6366F1" }:{
  data:number[]; width?:number; height?:number; stroke?:string;
}){
  if(!data.length) data=[0];
  const max=Math.max(...data,1);
  const step=width/Math.max(1,data.length-1);
  const pts=data.map((v,i)=>`${i*step},${height - (v/max)*(height-10)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((v,i)=>(
        <circle key={i} cx={i*step} cy={height - (v/max)*(height-10)} r="3.5" fill={stroke}/>
      ))}
    </svg>
  );
}
function BarChart({ labels=[], values=[], width=360, height=140, color="#06B6D4" }:{
  labels:string[]; values:number[]; width?:number; height?:number; color?:string;
}){
  if(!values.length) values=[0];
  const max=Math.max(...values,1);
  const bw=Math.max(16, width/values.length - 8);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {values.map((v,i)=>{
        const x=i*(bw+8)+10; const h=(v/max)*(height-24);
        return (
          <g key={i}>
            <rect x={x} y={height-h-20} width={bw} height={h} rx="4" fill={color}/>
            <text x={x+bw/2} y={height-6} fontSize="10" textAnchor="middle" fill="#94A3B8">{labels[i]||""}</text>
          </g>
        );
      })}
    </svg>
  );
}

