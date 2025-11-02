"use client";
import React from "react";

export default function Finance(){
  return (
    <div className="grid">
      <h2 className="h">Finance</h2>
      <section className="kpis">
        <div className="card kpi"><div className="mut">Cash In (mo)</div><div className="v">$18,400</div></div>
        <div className="card kpi"><div className="mut">Cash Out (mo)</div><div className="v">$9,750</div></div>
        <div className="card kpi"><div className="mut">Net</div><div className="v">$8,650</div></div>
        <div className="card kpi"><div className="mut">AR (30d)</div><div className="v">$3,200</div></div>
      </section>

      <section className="card">
        <div className="row"><h3 className="h">Invoices</h3><button className="btn">New Invoice</button></div>
        <table className="table">
          <thead><tr><th>ID</th><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>INV-1001</td><td>Acme Co</td><td>$3,000</td><td><span className="badge ok">Paid</span></td></tr>
            <tr><td>INV-1002</td><td>Bistro Ltd</td><td>$1,200</td><td><span className="badge warn">Due</span></td></tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="row"><h3 className="h">Payroll (stub)</h3><button className="btn ghost">Export CSV</button></div>
        <ul className="mut">
          <li>Ali Khan — $1,500</li>
          <li>Jane AM — $1,900</li>
          <li>Omar Dev — $2,200</li>
        </ul>
      </section>
    </div>
  );
}
