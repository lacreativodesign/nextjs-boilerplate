import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { authClient, dbClient } from "../lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import UploadBox from "../components/UploadBox";

export default function Admin(){
  const [ready,setReady] = useState(false);
  const [role,setRole] = useState<string>("");
  const [lastUpload,setLastUpload] = useState<string>("");

  useEffect(()=>{
    const unsub = onAuthStateChanged(authClient, async (u)=>{
      if(!u){ window.location.href="/login"; return; }
      const r = await getDoc(doc(dbClient,"users",u.uid));
      const role = r.exists()? r.data().role : "client";
      setRole(role); setReady(true);
    });
    return ()=>unsub();
  },[]);

  if(!ready) return <div style={{padding:20}}>Loading…</div>;

  return (
    <div style={{padding:20}}>
      <h1>Admin Dashboard</h1>
      <nav style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <Link href="/admin">Overview</Link>
        <Link href="/sales">Sales</Link>
        <Link href="/am">AM</Link>
        <Link href="/production">Production</Link>
        <Link href="/hr">HR</Link>
        <Link href="/client">Client</Link>
      </nav>

      <div style={{marginBottom:12}}>Role detected: <b>{role}</b></div>

      <div style={{display:"grid",gap:12,gridTemplateColumns:"1fr 1fr"}}>
        <section style={card}>
          <h3>Create Order ID</h3>
          <button onClick={createOrder} style={btn}>Create Order</button>
          <p id="orderResult" style={{marginTop:8}}></p>
        </section>

        <section style={card}>
          <h3>Upload a File (Uploadcare)</h3>
          <UploadBox onDone={(url)=> setLastUpload(url)} />
          {lastUpload && <p style={{marginTop:8,wordBreak:"break-all"}}>Uploaded URL: {lastUpload}</p>}
        </section>

        <section style={card}>
          <h3>Send Test Email (Resend)</h3>
          <button onClick={sendEmail} style={btn}>Send Email to me</button>
          <p style={{fontSize:12,color:"#64748b"}}>Check inbox in a few seconds.</p>
        </section>
      </div>
    </div>
  );
}

const card = {background:"#fff",padding:16,borderRadius:12,boxShadow:"0 6px 20px rgba(2,6,23,.08)"} as const;
const btn = {padding:"10px 12px",border:0,borderRadius:10,background:"#0ea5e9",color:"#fff",cursor:"pointer"} as const;

async function createOrder(){
  const res = await fetch("/api/create-order", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ clientUid:"demoClient", projectId:"demoProject", amount:1999 }),
  });
  const data = await res.json();
  (document.getElementById("orderResult") as any).innerText = "New Order: " + data.orderId;
}

async function sendEmail(){
  const to = prompt("Enter your email to receive a test:");
  if(!to) return;
  await fetch("/api/notify", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      to,
      subject: "LA CREATIVO ERP — Test Email",
      html: "<p>Hello from your live ERP.</p>"
    }),
  });
  alert("Sent (if domain verified in Resend).");
}
