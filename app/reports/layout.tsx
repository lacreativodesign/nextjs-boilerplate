"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", path: "/reports" },
    { label: "Sales Reports", path: "/reports/sales" },
    { label: "Project Reports", path: "/reports/projects" },
    { label: "Team Performance", path: "/reports/team" },
    { label: "Financial Reports", path: "/reports/finance" },
  ];

  return (
    <div className="reports-shell">
      {/* SIDEBAR */}
      <aside className="reports-sidebar">
        <h2 className="reports-title">Reports</h2>

        <nav className="reports-nav">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.path);

            return (
              <Link key={item.path} href={item.path} className={`reports-link ${active ? "active" : ""}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN AREA */}
      <div className="reports-main">
        {/* HEADER */}
        <header className="reports-header">
          <h1 className="text-lg font-semibold">Reporting Center</h1>

          <button
            onClick={async () => {
              await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
              });
              window.location.href = "/login";
            }}
            className="btn btn-danger"
          >
            LOGOUT
          </button>
        </header>

        {/* CONTENT */}
        <main className="reports-content">
          <div className="page-frame">{children}</div>
        </main>
      </div>
    </div>
  );
}
