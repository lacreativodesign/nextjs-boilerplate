import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { authClient, dbClient } from "../lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";

export default function Login(){
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const r = useRouter();

  async function onSubmit(e:any){
    e.preventDefault(); setLoading(true);
    try{
      const cred = await signInWithEmailAndPassword(authClient, email, password);
      const snap = await getDoc(doc(dbClient,"users",cred.user.uid));
      const role = snap.exists()? snap.data().role : "client";
      const route = role==="admin"?"/admin":role==="sales"?"/sales":role==="am"?"/am":role==="production"?"/production":role==="hr"?"/hr":"/client";
      r.push(route);
    }catch(err:any){ alert(err.message); }
    setLoading(false);
  }

  async function forgot(){
    if(!email){ alert("Enter your email first"); return; }
    await sendPasswordResetEmail(authClient, email);
    alert("Password reset email sent.");
  }

  return (
    <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#0b1225"}}>
      <form onSubmit={onSubmit} style={{width:360,padding:24,background:"rgba(255,255,255,.06)",borderRadius:16,backdropFilter:"blur(10px)",color:"#e8eef7"}}>
        <h2 style={{marginTop:0}}>Sign in</h2>
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={input}/>
        <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={input}/>
        <button disabled={loading} style={btn}>{loading?"..." : "Continue"}</button>
        <div style={{marginTop:8,display:"flex",justifyContent:"space-between"}}>
          <a onClick={forgot} style={{color:"#8ab4ff",cursor:"pointer"}}>Forgot password?</a>
          <span>LA CREATIVO ERP</span>
        </div>
      </form>
    </div>
  );
}
const input = {width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"#fff",marginBottom:10} as const;
const btn = {width:"100%",padding:"12px",border:0,borderRadius:10,background:"#06b6d4",color:"#fff",cursor:"pointer"} as const;
