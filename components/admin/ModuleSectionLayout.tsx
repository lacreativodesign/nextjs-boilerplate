"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabItem = { label: string; path: string };

export default function ModuleSectionLayout({
  title,
  description,
  tabs,
  children,
}: {
  title: string;
  description: string;
  tabs: TabItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      {/* TITLE + DESCRIPTION (Option A Locked) */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          {title}
        </h2>
        <p style={{ fontSize: 15, color: "var(--sidebar-text)" }}>
          {description}
        </p>
      </div>

      {/* BLUE PILL TABS (Locked UI) */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
          paddingBottom: 6,
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link
              key={t.path}
              href={t.path}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                textDecoration: "none",
                background: active ? "#2563eb" : "transparent",
                color: active ? "#ffffff" : "var(--sidebar-text)",
                border: active ? "1px solid #2563eb" : "1px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* CONTENT CARD */}
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
    </div>
  );
                  }
