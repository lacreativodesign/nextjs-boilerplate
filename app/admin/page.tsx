"use client";
import React from "react";

const projects = [
  { id:"LC-0001", client:"Acme Co", service:"Website", budget:12450, status:"Review", am:"Jane AM", due:"2025-11-18" },
  { id:"LC-0002", client:"Bistro Ltd", service:"Branding", budget:3850, status:"In Progress", am:"Sam AM", due:"2025-11-03" },
  { id:"LC-0003", client:"Fintech Inc", service:"SEO", budget:5600, status:"Delivered", am:"Lia AM", due:"2025-10-22" },
];

const clients = [
  { email:"ceo@acme.com", name:"Acme Co", services:["Website","SEO"], paid:true, amount:12450, am:"Jane AM" },
  { email:"hello@bistro.io", name:"Bistro Ltd", services:["Branding"], paid:false, amount:3850, am:"Sam AM" },
];

export default function Admin(){
  return (
    <div className="grid">
      {/* OVERVIEW */}
      <section className="grid">
        <h2 className="h">Overview</h2>
        <div className="kpis">
          <div className="card kpi"><div className="mut">MRR</div><div className="v">$28,940</div></div>
          <div className="card kpi"><div className="mut">Open Projects</div><div className="v">12</div></div>
          <div className="card kpi"><div className="mut">Utilization</div><div className="v">78%</div></div>
          <div className="card kpi"><div className="mut">AR (30d)</div><div className="v">$9,200</div></div>
        </div>

        <div className="grid" style={{gridTemplateColumns:"2fr 1fr"}}>
          <div className="card">
            <div className="row"><h3 className="h">Revenue (last 6 mo)</h3><span className="tag">Admin</span></div>
            <Line data={[18,22,19,28,31,36]}/>
          </div>
          <div className="card">
            <h3 className="h">Work Mix</h3>
            <Donut values={[42,28,18,12]} />
            <div className="mut" style={{marginTop:8}}>Website / Social / SEO / Branding</div>
          </div>
        </div>
      </section>

      {/* TEAM ANALYTICS */}
      <section className="card">
        <div className="row"><h3 className="h">Team Analytics</h3><button className="btn ghost">Export CSV</button></div>
        <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
          <div>
            <div className="mut">Throughput</div>
            <Bars labels={[]} values={[12,15,9,18,17,14]} />
          </div>
          <div>
            <div className="mut">Bug/Revision Rate</div>
            <Bars values={[3,2,4,3,1,2]} color="#EF4444" />
          </div>
        </div>
      </section>

      {/* HIERARCHY */}
      <section className="card">
        <h3 className="h">Hierarchy</h3>
        <div className="mut">Admin → Sales (3) → AM (3) → Production (7)</div>
        <div style={{marginTop:10,display:"grid",gap:8}}>
          <div><b>Sales Lead:</b> Ali • Team: {["Sara","Mo","Riz"].join(", ")}</div>
          <div><b>AM Lead:</b> Jane • Team: {["Sam","Lia","Omar"].join(", ")}</div>
        </div>
      </section>

      {/* ACTIVITY */}
      <section className="card">
        <div className="row"><h3 className="h">Recent Activity</h3><button className="btn ghost">Mark all read</button></div>
        <ul>
          <li>✅ Admin marked <b>LC-0003</b> delivered</li>
          <li>💬 AM Jane messaged Client <b>Acme Co</b></li>
          <li>💳 Payment link created for <b>Bistro Ltd</b></li>
        </ul>
      </section>

      {/* PROJECTS */}
      <section className="card">
        <div className="row"><h3 className="h">Projects</h3><a className="btn" href="#">New Project</a></div>
        <table className="table">
          <thead><tr><th>Order ID</th><th>Client</th><th>Service</th><th>Budget</th><th>Status</th><th>AM</th><th>Due</th></tr></thead>
          <tbody>
            {projects.map(p=>(
              <tr key={p.id}>
                <td><a href="#" className="tag">{p.id}</a></td>
                <td>{p.client}</td>
                <td>{p.service}</td>
                <td>${p.budget.toLocaleString()}</td>
                <td><span className={`badge ${p.status==="Delivered"?"ok":"mut"}`}>{p.status}</span></td>
                <td>{p.am}</td>
                <td>{p.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* CLIENTS */}
      <section className="card">
        <div className="row"><h3 className="h">Clients</h3><button className="btn ghost">Import</button></div>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Services</th><th>AM</th><th>Status</th><th>Amount</th></tr></thead>
          <tbody>
            {clients.map(c=>(
              <tr key={c.email}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.services.join(", ")}</td>
                <td>{c.am}</td>
                <td>{c.paid? <span className="badge ok">PAID</span>: <span className="badge warn">DUE</span>}</td>
                <td>${c.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* TEAM */}
      <section className="card">
        <div className="row"><h3 className="h">Team</h3><a className="btn" href="#">Add Member</a></div>
        <div className="grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          {["Sales","AM","Production"].map((g,i)=>(
            <div key={i} className="card"><b>{g}</b><div className="mut">3 members</div></div>
          ))}
        </div>
      </section>

      {/* FINANCE */}
      <section className="grid" style={{gridTemplateColumns:"1.5fr 1fr", gap:14}}>
        <div className="card">
          <div className="row"><h3 className="h">Invoices</h3><button className="btn ghost">Create</button></div>
          <table className="table">
            <thead><tr><th>ID</th><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>INV-001</td><td>Acme Co</td><td>$3,000</td><td><span className="badge ok">Paid</span></td></tr>
              <tr><td>INV-002</td><td>Bistro Ltd</td><td>$1,200</td><td><span className="badge warn">Due</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="h">AR Aging</h3>
          <Bars values={[6,3,2]} color="#F59E0B" />
          <div className="mut">30 / 60 / 90 days</div>
        </div>
      </section>

      {/* REPORTS */}
      <section className="card">
        <div className="row"><h3 className="h">Reports</h3><button className="btn ghost" onClick={()=>alert("Exported CSV (demo)")}>Export CSV</button></div>
        <p className="mut">Exports: Revenue by service, Utilization, AR, Conversion, Delivery SLAs.</p>
      </section>

      {/* SETTINGS + PROFILE */}
      <section className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
        <div className="card">
          <h3 className="h">Settings</h3>
          <div className="grid">
            <input className="input" placeholder="Company Name" defaultValue="LA CREATIVO" />
            <input className="input" placeholder="Reply-To Email" defaultValue="support@lacreativo.com" />
            <button className="btn">Save</button>
          </div>
        </div>
        <div className="card">
          <h3 className="h">Profile</h3>
          <div className="grid">
            <input className="input" placeholder="Name" defaultValue="Admin" />
            <input className="input" placeholder="Phone" defaultValue="+92 3xx xxxxxx" />
            <div className="row" style={{gap:8}}>
              <button className="btn">Upload Avatar</button>
              <button className="btn ghost">Change Password</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* inline SVG helpers */
function Line({data=[10,20,12,28,32,40], w=520,h=140, stroke="#6366F1"}){
  const max=Math.max(...data,1); const step=w/Math.max(1,data.length-1);
  const pts=data.map((v,i)=>`${i*step},${h-(v/max)*(h-12)}`).join(" ");
  return <svg width={w} height={h}><polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} strokeLinecap="round" /></svg>;
}
function Bars({labels=[], values=[2,5,3,6], w=520,h=140, color="#06B6D4"}){
  const max=Math.max(...values,1); const bw=Math.max(18, w/values.length - 12);
  return <svg width={w} height={h}>{values.map((v,i)=>{const x=i*(bw+12)+8; const hh=(v/max)*(h-24); return <g key={i}><rect x={x} y={h-hh-16} width={bw} height={hh} rx="6" fill={color}/></g>;})}</svg>;
}
function Donut({values=[40,35,25], colors=["#6366F1","#06B6D4","#10B981"], size=140}){
  const total=values.reduce((s,v)=>s+v,0)||1; let a=-90; const cx=size/2, cy=size/2, r=size/2-8;
  return <svg width={size} height={size}>{values.map((v,i)=>{const p=v/total; const a1=a*Math.PI/180, a2=(a+p*360)*Math.PI/180;
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    const large=p>0.5?1:0; a+=p*360;
    return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={colors[i%colors.length]} />})}
    <circle cx={cx} cy={cy} r={r*0.58} fill="#fff"/></svg>;
}
