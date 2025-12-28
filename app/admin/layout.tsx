"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  FolderKanban,
  PackageCheck,
  Wallet,
  UserCog,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  LogOut,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import { signOut, type Auth } from "firebase/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [authInstance, setAuthInstance] = useState<Auth | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Always correct URL (prevents Overview from staying highlighted)
  const [realPath, setRealPath] = useState(pathname);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRealPath(window.location.pathname);
    }
  }, [pathname]);

  const normalize = (p: string) => p.replace(/\/+$/, "") || "/";

  const current = normalize(realPath);

  const navItems = [
    { label: "Overview", path: "/admin", icon: LayoutDashboard },
    { label: "Users", path: "/admin/users", icon: Users },
    { label: "Clients", path: "/admin/clients", icon: Briefcase },
    { label: "Sales & Pipeline", path: "/admin/sales", icon: TrendingUp },
    { label: "Projects & Delivery", path: "/admin/projects", icon: FolderKanban },
    { label: "Production", path: "/admin/production", icon: PackageCheck },
    { label: "Finance", path: "/admin/finance", icon: Wallet },
    { label: "HR & Team", path: "/admin/hr", icon: UserCog },
    { label: "Reports", path: "/admin/reports", icon: BarChart3 },
    { label: "Settings", path: "/admin/settings", icon: SettingsIcon },
  ];

  const handleLogout = async () => {
    if (!authInstance) return;
    try {
      // 1) Sign out from Firebase (RequireAuth listens to this)
      await signOut(authInstance);
    } catch (err) {
      console.error("Firebase signOut error:", err);
    }

    try {
      // 2) Tell backend to clear the 'session' cookie
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("API logout error:", err);
    }

    // 3) Hard redirect to login
    window.location.href = "/login";
  };

  useEffect(() => {
    let active = true;

    getFirebaseAuth()
      .then((instance) => {
        if (active) {
          setAuthInstance(instance);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Firebase auth", err);
        if (active) {
          setAuthError(err?.message || "Unable to start authentication.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!authInstance) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100">
        <p className="text-sm font-medium">
          {authError || "Loading admin console…"}
        </p>
      </div>
    );
  }

  return (
    <div className="admin-shell flex min-h-screen transition-colors">
      {/* SIDEBAR */}
      <aside
        className={clsx(
          "admin-sidebar h-screen sticky top-0 transition-all duration-300",
          collapsed ? "w-20" : "w-64"
        )}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            <h2 className="text-xl font-bold tracking-tight">ADMIN</h2>
          )}
          <button
            className="p-2 rounded-md hover:bg-[var(--surface-muted)]"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={20} />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            const itemPath = normalize(item.path);
            const isOverview = itemPath === "/admin";

            const active = isOverview
              ? current === "/admin"
              : current === itemPath || current.startsWith(itemPath + "/");

            return (
              <Link
                key={item.path}
                href={item.path}
                className={clsx(
                  "admin-link flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  active && "active"
                )}
              >
                <Icon size={18} />

                {!collapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN SECTION */}
      <div className="flex-1 flex flex-col">
        {/* TOP HEADER */}
        <header className="admin-header h-16 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>

          <div className="flex items-center gap-3">
            {/* LOGOUT */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
