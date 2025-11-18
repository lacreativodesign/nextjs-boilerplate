// app/admin/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="admin" title="Admin Dashboard">
      {children}
    </ERPLayout>
  );
}
