"use client";
import React from "react";

const my = { company:"LA CREATIVO", address:"Karachi • Pakistan", email:"billing@lacreativo.com" };
const invoice = { id:"INV-003", client:"Fintech Inc", items:[{name:"Dashboard Design", qty:1, price:8000}], total:8000, status:"Paid" };

export default function Client(){
  function downloadPDF(){
    const win = window.open("", "PRINT", "height=650,width=900,top=100,left=150");
    if(!win) return;
    win.document.write(`<html><head><title>${invoice.id}</title></head><body>`);
    win.document.write(`<h2 style="margin:0">Invoice ${invoice.id}</h2><div>${my.company} — ${my.address}</div><hr/>`);
    win.document.write(`<div><b>Bill To:</b> ${invoice.client}</div>`);
    win.document.write(`<table border="1" cellspacing="0" cellpadding="6" style="margin-top:8px;border-collapse:collapse;"><tr><th>Item</th><th>Qty</th><th>Price</th></tr>${
      invoice.items.map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>$${i.price.toLocaleString()}</td></tr>`).join("")
    }</table>`);
    win.document.write(`<h3>Total: $${invoice.total.toLocaleString()}</h3>`);
    win.document.write(`<div>Status: ${invoice.status}</div>`);
    win.document.write(`</body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  }

  return (
    <div className="grid">
      <h2 className="h">My Dashboard</h2>
      <div className="kpis">
        <div className="card kpi"><div className="mut">Active Projects</div><div className="v">2</div></div>
        <div className="card kpi"><div className="mut">Invoices</div><div className="v">1 Paid</div></div>
        <div className="card kpi"><div className="mut">AM</div><div className="v">Jane</div></div>
        <div className="card kpi"><div className="mut">Last Update</div><div className="v">Today</div></div>
      </div>

      <section className="card">
        <div className="row"><h3 className="h">Billing</h3><button className="btn" onClick={downloadPDF}>Download Paid Invoice (PDF)</button></div>
        <div className="mut">Most recent: {invoice.id} — ${invoice.total.toLocaleString()} — {invoice.status}</div>
      </section>

      <section className="card">
        <h3 className="h">Files</h3>
        <div style={{border:"2px dashed rgba(148,163,184,.35)",padding:10,borderRadius:12}}>
          <input type="file" /> <span className="mut">Attach revision notes if needed.</span>
        </div>
      </section>
    </div>
  );
}
