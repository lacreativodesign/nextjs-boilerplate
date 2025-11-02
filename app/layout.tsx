/** @format */

import "./globals.css";
import React, { ReactNode } from "react";

export const metadata = { title: "LA CREATIVO ERP" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
        <ThemeScript />
      </body>
    </html>
  );
}

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  const k='lac_theme'; 
  const v=localStorage.getItem(k)||'dark';
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
  const path =
    typeof window !== "undefined" ? window.location.pathname : "/";

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
        <div className="mut" style={{ marginBottom: 10 }}>
          Unified ERP
        </div>
        <div className="nav">
          {items.map((it) => (
            <a key={it.href} href={it.href} style={{ textDecoration: "none" }}>
              <button className={path === it.href ? "active" : ""}>
                {it.label}
              </button>
            </a>
          ))}
        </div>
        <button id="theme-toggle" className="toggle" style={{ marginTop: 12 }}>
          Toggle Theme
        </button>
      </aside>

      <main className="content">{children}</main>

      <style>{`
        :root{
          --bg:#0B1224; --bg2:#0F172A; --card:#0D1A33; --mut:#94A3B8; --text:#E9EEF5;
          --brand:#06B6D4; --accent:#6366F1; --radius:16px;
          --lightbg:#F6F8FC; --lightcard:#FFFFFF; --lighttext:#0F172A; --lightmut:#6B7280;
        }
        *{box-sizing:border-box;font-family:Inter,system-ui}
        body{margin:0}

        .wrap{display:flex;min-height:100vh;background:var(--lightbg)}
        .dark .wrap{background:linear-gradient(180deg,#081225,#0A1529)}

        .sidebar{
          width:260px;padding:20px;
          background:var(--lightcard);
          border-right:1px solid rgba(0,0,0,.06)
        }
        .dark .sidebar{
          background:rgba(12,22,42,.6);
          backdrop-filter:blur(14px);
          border-right:1px solid rgba(255,255,255,.06);
        }

        .brand{color:var(--brand);font-weight:900;font-size:22px}

        .nav button{
          width:100%;padding:10px 12px;
          margin:4px 0;border:0;border-radius:12px;
          background:transparent;color:#475569;
          font-weight:700;cursor:pointer;text-align:left
        }
        .dark .nav button{color:#cfd8df}
        .nav button.active{background:rgba(99,102,241,.15)}

        .toggle{
          border:1px solid rgba(0,0,0,.1);
          background:transparent;
          padding:10px 12px;border-radius:12px;
          font-weight:700;cursor:pointer;
          color:#475569;
        }
        .dark .toggle{
          border:1px solid rgba(255,255,255,.2);
          color:#dfe7ef;
        }

        .content{flex:1;padding:20px}
      `}</style>
    </div>
  );
}
