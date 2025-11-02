// app/layout.tsx
import "./globals.css";
import React, { ReactNode } from "react";

export const metadata = { title: "LA CREATIVO ERP" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
        <style>{`
          :root{
            --bg:#0B1224; --bg2:#0F172A; --card:#0D1A33; --mut:#94A3B8; --text:#E9EEF5;
            --brand:#06B6D4; --accent:#6366F1; --ok:#10B981; --danger:#EF4444; --radius:16px;
            --lightbg:#F6F8FC; --lightcard:#FFFFFF; --lighttext:#0F172A; --lightmut:#6B7280;
          }
          *{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui}
          body{margin:0}
          .wrap{display:flex; min-height:100vh; background:var(--lightbg)}
          .dark .wrap{background:linear-gradient(180deg,#061226,#0A1529)}
          .sidebar{width:260px;padding:18px;background:var(--lightcard);border-right:1px solid rgba(2,6,23,.06)}
          .dark .sidebar{background:linear-gradient(180deg,#081225,#07192A);border-right:1px solid rgba(255,255,255,.06)}
          .brand{font-weight:900;color:var(--brand);letter-spacing:-.3px;margin-bottom:10px}
          .mut{color:var(--lightmut)} .dark .mut{color:var(--mut)}
          .nav button{width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:0;background:transparent;color:#334155;cursor:pointer;font-weight:700;margin:4px 0}
          .dark .nav button{color:#D1D5DB}
          .nav button.active{background:rgba(99,102,241,.08)}
          .content{flex:1;padding:18px}
          .card{background:var(--lightcard); border-radius:16px; padding:14px; box-shadow:0 10px 30px rgba(2,6,23,.06)}
          .dark .card{background:rgba(16,28,56,.72); backdrop-filter: blur(10px); border:1px solid rgba(255,255,255,.06)}
          .btn{border:0;border-radius:12px;padding:10px 12px;font-weight:800;color:white;background:linear-gradient(90deg,var(--brand),var(--accent)); cursor:pointer}
          .chip{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(6,182,212,.12);color:var(--brand);font-weight:700}
          .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
          .panelGrid{display:grid;grid-template-columns:2fr 1fr; gap:12px}
          @media (max-width:980px){.sidebar{display:none}.content{padding:12px}.kpis{grid-template-columns:1fr}.panelGrid{grid-template-columns:1fr}}
          .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
          .search{display:flex;gap:8px;background:var(--lightcard);padding:8px 10px;border-radius:12px}
          .dark .search{background:#0D1A33}
          .search input{border:0;outline:0;background:transparent}
          .toggle{border:1px solid rgba(2,6,23,.1); background:transparent; color:inherit; border-radius:12px; padding:8px 10px; cursor:pointer}
          .dark .toggle{border:1px solid rgba(255,255,255,.12)}
          a.link{color:var(--accent);text-decoration:none;font-weight:700}
        `}</style>
        <ThemeScript />
      </body>
    </html>
  );
}

function ThemeScript() {
  // keep theme across reloads
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  const k='lac_theme'; const v=localStorage.getItem(k)||'dark';
  if(v==='dark') document.documentElement.classList.add('dark');
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='theme-toggle'){
      const d=document.documentElement.classList.toggle('dark');
      localStorage.setItem(k, d?'dark':'light');
    }
  });
})();
`,
      }}
    />
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  // simple active check on client-side paths
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const items = [
    { href: "/admin", label: "Admin" },
    { href: "/sales", label: "Sales" },
    { href: "/am", label: "Account Manager" },
    { href: "/production", label: "Production" },
    { href: "/client", label: "Client" },
    { href: "/hr", label: "HR" },
    { href: "/finance", label: "Finance" },
    { href: "/login", label: "Login" },
  ];
  return (
    <div className="wrap">
      <aside className="sidebar">
        <div className="brand">LA CREATIVO</div>
        <div className="mut" style={{marginBottom:10}}>Unified Portal</div>
        <div className="nav">
          {items.map(it => (
            <a key={it.href} href={it.href} style={{textDecoration:"none"}}>
              <button className={path===it.href?"active":""}>{it.label}</button>
            </a>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <button id="theme-toggle" className="toggle">Toggle Theme</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
