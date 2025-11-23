"use client";

import ModuleSectionLayout from "@/components/admin/ModuleSectionLayout";

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const tabs = [
    { label: "All Users", path: "/admin/users" },
    { label: "Create User", path: "/admin/users/create" },
    { label: "View User Details", path: "/admin/users/view" },
    { label: "Activity Log", path: "/admin/users/activity" },
  ];

  return (
    <ModuleSectionLayout
      title="User Management"
      description="Manage ERP users, roles and activity logs."
      tabs={tabs}
    >
      {children}
    </ModuleSectionLayout>
  );
}
