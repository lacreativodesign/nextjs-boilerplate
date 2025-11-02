"use client";
import React, { useState } from "react";

export default function Login() {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");

  return (
    <div style={{display:"grid",placeItems:"center",minHeight:"100vh"}}>
      <div style={{
        width:420,
        padding:24,
        borderRadius:18,
        background:"rgba(16,28,56,.7)",
        backdropFilter:"blur(14px)",
        border:"1px solid rgba(255,255,255,.08)",
      }}>
        <div style={{color:"#06B6D4",fontWeight:900,fontSize:20}}>LA CREATIVO</div>
        <h2 style={{margin:"10px 0 4px 0"}}>Welcome back</h2>
        <p style={{color:"#94A3B8"}}>Sign in to your workspace</p>

        <form onSubmit={(e)=>{e.preventDefault(); window.location.href="/admin";}}>
          <label style={{fontSize:12,color:"#9AA6B2"}}>Email</label>
          <input
            value={email}
            onChange={e=>setEmail(e.target.value)}
            style={{
              width:"100%",padding:12,borderRadius:12,
              border:"1px solid rgba(255,255,255,.12)",
              background:"transparent",color:"#E9EEF5",marginBottom:12
            }}
          />

          <label style={{fontSize:12,color:"#9AA6B2"}}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            style={{
              width:"100%",padding:12,borderRadius:12,
              border:"1px solid rgba(255,255,255,.12)",
              background:"transparent",color:"#E9EEF5",marginBottom:18
            }}
          />

          <button className="btn" style={{width:"100%"}}>Sign In</button>
        </form>

        <a className="link" href="#" style={{marginTop:12,display:"block"}}>Forgot password?</a>
      </div>
    </div>
  );
}
