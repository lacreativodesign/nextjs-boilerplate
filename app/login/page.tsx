"use client";

import React, { useMemo, useState } from "react";

function useTheme(defaultDark = true){
  const [dark,setDark] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("lac_theme") === "light" ? false : defaultDark)
  );
  const t = useMemo(()=>({
    dark,
    bg: dark ? "#070F22" : "#F5F7FB",
    glowA: "radial-gradient(50% 40% at 15% 10%, rgba(99,102,241,.14), transparent)",
    glowB: "radial-gradient(55% 40% at 85% 90%, rgba(6,182,212,.16), transparent)",
    card: dark ? "rgba(16,28,56,.72)" : "rgba(255,255,255,.82)",
    blur: "blur(10px)",
    text: dark ? "#E8EEF7" : "#0F172A",
    mut:  dark ? "#9AA6B2" : "#64748B",
    border: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)",
    brand: "#06B6D4",
    accent: "#6366F1",
    ok: "#10B981",
    danger: "#EF4444",
    radius: 18,
    shadow: dark
      ? "0 30px 80px rgba(2,6,23,.55)"
      : "0 30px 80px rgba(2,6,23,.12)",
  }),[dark]);
  return { dark, setDark, t };
}

export default function Login(){
  const { dark,setDark,t } = useTheme(true);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [showPw,setShowPw] = useState(false);
  const [forgot,setForgot] = useState(false);
  const [sent,setSent] = useState(false);

  function handleForgotSubmit(e: React.FormEvent){
    e.preventDefault();
    if(!email){ alert('Enter your email first'); return; }
    setSent(true);
    setTimeout(()=>setSent(false),4000);
  }

  return (
    <div className="wrap" style={{ color:t.text, background: `${t.bg}, ${t.glowA}, ${t.glowB}` }}>
      <div className="glass" style={{
        background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur,
        boxShadow: t.shadow, border: `1px solid ${t.border}`, borderRadius: t.radius
      }}>
        <div className="brandRow">
          <div className="logo">LA CREATIVO</div>
          <button className="mode" onClick={() => {
            setDark(d=>!d); if (typeof window !== "undefined") localStorage.setItem("lac_theme", dark ? "light" : "dark");
          }}>{dark ? "Light" : "Dark"}</button>
        </div>

        {!forgot ? (
          <>
            <h1 className="title">Welcome back</h1>
            <p className="sub">Access your projects, billing, and team workspace.</p>

            <form className="form" onSubmit={(e)=>e.preventDefault()}>
              <div className="field">
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder=" " />
                <label>Email address</label>
              </div>

              <div className="field pw">
                <input type={showPw ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} required placeholder=" " />
                <label>Password</label>
                <button type="button" className="eye" onClick={()=>setShowPw(s=>!s)} aria-label="Toggle password">
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>

              <div className="row">
                <label className="check">
                  <input type="checkbox" defaultChecked /> <span>Remember me</span>
                </label>
                <button type="button" className="link" onClick={()=>setForgot(true)}>Forgot password?</button>
              </div>

              <button type="submit" className="btn primary">Sign in</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="title">Reset password</h1>
            <p className="sub">Enter your registered email to receive reset instructions.</p>
            <form className="form" onSubmit={handleForgotSubmit}>
              <div className="field">
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder=" " />
                <label>Email address</label>
              </div>
              <button type="submit" className="btn primary">Send reset link</button>
              {sent && <p className="sent">Reset link sent! Check your inbox.</p>}
              <button type="button" className="link" onClick={()=>setForgot(false)}>← Back to login</button>
            </form>
          </>
        )}
      </div>

      <style>{`
        *{ box-sizing:border-box; font-family: Inter, ui-sans-serif, system-ui; }
        .wrap{ min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; background-repeat:no-repeat; }
        .glass{ width:100%; max-width:460px; padding:34px; }
        .brandRow{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .logo{ font-weight:900; letter-spacing:-0.4px; color:#06B6D4; }
        .mode{ border:1px solid rgba(255,255,255,.18); background:transparent; color:inherit; padding:8px 10px; border-radius:10px; cursor:pointer; }
        .title{ margin:8px 0 4px 0; font-size:26px; }
        .sub{ margin:0 0 14px 0; color: #94A3B8; font-size:14px; }
        .btn{ border:none; border-radius:12px; padding:12px 14px; cursor:pointer; font-weight:700; }
        .btn.primary{ background:#06B6D4; color:#fff; }
        .form{ display:grid; gap:12px; margin-top:4px; }
        .field{ position:relative; }
        .field input{ width:100%; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.02); color:inherit; }
        .field label{ position:absolute; left:12px; top:12px; font-size:13px; color:#94A3B8; pointer-events:none; transition:.18s; }
        .field input:focus + label, .field input:not(:placeholder-shown) + label { top:-8px; left:10px; font-size:11px; color:#06B6D4; padding:0 6px; background:transparent; }
        .pw .eye{ position:absolute; right:8px; top:8px; border:1px solid rgba(255,255,255,.18); background:transparent; color:inherit; border-radius:10px; padding:4px 8px; cursor:pointer; }
        .row{ display:flex; justify-content:space-between; align-items:center; margin-top:2px; }
        .check{ display:flex; align-items:center; gap:8px; color:#94A3B8; }
        .link{ border:none; background:none; color:#6366F1; cursor:pointer; }
        .sent{ color:#10B981; font-size:13px; margin-top:4px; }
      `}</style>
    </div>
  );
}
