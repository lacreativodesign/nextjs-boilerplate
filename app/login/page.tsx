// app/login/page.tsx
"use client";
import React, { useMemo, useState } from "react";

export default function Login() {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const t = useMemo(()=>({ text:"#E9EEF5", mut:"#9AA6B2", card:"rgba(16,28,56,.72)", border:"rgba(255,255,255,.08)" }),[]);
  return (
    <div style={{display:"grid",placeItems:"center",minHeight:"calc(100vh - 24px)"}}>
      <div style={{width:420, background:t.card, border:`1px solid ${t.border}`, borderRadius:18, padding:22}}>
        <div style={{color:"#06B6D4",fontWeight:900,letterSpacing:"-.3px"}}>LA CREATIVO</div>
        <h2 style={{margin:"8px 0 4px 0"}}>Welcome back</h2>
        <p style={{margin:"0 0 12px 0", color:t.mut}}>Sign in to your workspace</p>
        <form onSubmit={(e)=>{e.preventDefault(); window.location.href="/admin";}}>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:12, color:t.mut}}>Email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)}
              style={{width:"100%",padding:12,borderRadius:12,border:"1px solid rgba(255,255,255,.12)",background:"transparent", color:t.text}} />
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12, color:t.mut}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              style={{width:"100%",padding:12,borderRadius:12,border:"1px solid rgba(255,255,255,.12)",background:"transparent", color:t.text}} />
          </div>
          <button className="btn" style={{width:"100%"}} type="submit">Sign in</button>
        </form>
        <div style={{marginTop:10}}>
          <a className="link" href="#">Forgot password?</a>
        </div>
      </div>
    </div>
  );
}
