"use client";
import React, { useMemo, useState } from "react";

export default function Login(){
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  function routeByEmail(e:React.FormEvent){e.preventDefault();
    const role = (email.split("@")[0]||"").toLowerCase();
    const map:any = { admin:"/admin", sales:"/sales", am:"/am", client:"/client", production:"/production", hr:"/hr", finance:"/finance" };
    window.location.href = map[role] || "/admin";
  }
  return (
    <div style={{display:"grid",placeItems:"center",minHeight:"100vh"}}>
      <div className="card" style={{width:420}}>
        <div className="brand">LA CREATIVO</div>
        <h2 className="h">Sign in</h2>
        <p className="mut">Use dummy roles like <b>admin@lac.com</b>, <b>sales@lac.com</b>, etc.</p>
        <form onSubmit={routeByEmail} className="grid">
          <input className="input" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="btn" type="submit">Continue</button>
          <a href="#" className="mut" style={{textDecoration:"none"}} onClick={(e)=>{e.preventDefault(); alert("Forgot password flow (stub)");}}>Forgot password?</a>
        </form>
      </div>
    </div>
  );
}
