"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  DollarSign,
  Settings,
  UserCog,
  BarChart4,
  PanelsTopLeft,
} from "lucide-react";

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, path: "/admin" },
    { label: "User Management", icon: Users, path: "/admin/users" },
    { label: "Clients", icon: UserCog, path: "/admin/clients" },
    { label: "Projects", icon: Briefcase, path: "/admin/projects" },
    { label: "Finance", icon: DollarSign, path: "/admin/finance" },
    { label: "HR & Team", icon: FileText, path: "/admin/hr" },
    { label: "Production", icon: PanelsTopLeft, path: "/admin/production" },
    { label: "Leads", icon: BarChart4, path: "/admin/leads" },
    { label: "Sales", icon: BarChart4, path: "/admin/sales" },
    { label: "Sales Manager", icon: BarChart4, path: "/admin/sales_manager" },
    { label: "Reports", icon: FileText, path: "/admin/reports" },
    { label: "Settings", icon: Settings, path: "/admin/settings" },
  ];

  return (
    <aside
      style={{
        width: collapsed ? 80 : 240,
        transition: "0.25s",
        backgroundColor: "var(--sidebar-bg)",
        color: "var(--sidebar-text)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 10px",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--sidebar-text)",
          cursor: "pointer",
          marginBottom: 30,
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {collapsed ? ">>" : "<< Collapse"}
      </button>

      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.path);

        return (
          <Link
            key={item.path}
            href={item.path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : 12,
              padding: "12px 10px",
              borderRadius: 8,
              marginBottom: 6,
              background: active ? "var(--sidebar-active)" : "transparent",
              color: active ? "var(--sidebar-active-text)" : "var(--sidebar-text)",
              textDecoration: "none",
              transition: "0.2s",
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            <Icon size={22} />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </aside>
  );
}
