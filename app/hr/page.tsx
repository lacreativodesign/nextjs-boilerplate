"use client";
import React from "react";

export default function HR(){
  return (
    <div className="grid">
      <h2 className="h">HR — Management Layer</h2>
      <section className="kpis">
        <div className="card kpi"><div className="mut">Employees</div><div className="v">14</div></div>
        <div className="card kpi"><div className="mut">Open Roles</div><div className="v">2</div></div>
        <div className="card kpi"><div className="mut">Onboarding</div><div className="v">3</div></div>
        <div className="card kpi"><div className="mut">Attrition</div><div className="v">2%</div></div>
      </section>
      <section className="card">
        <div className="row"><h3 className="h">Directory</h3><button className="btn ghost">Export</button></div>
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Manager</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Ali Khan</td><td>Sales</td><td>Sales Lead</td><td><span className="badge ok">Active</span></td></tr>
            <tr><td>Jane AM</td><td>Account Manager</td><td>AM Lead</td><td><span className="badge ok">Active</span></td></tr>
            <tr><td>Omar Dev</td><td>Frontend Dev</td><td>Prod Lead</td><td><span className="badge warn">Probe</span></td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
