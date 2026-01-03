// app/hr/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";
import RequireAuth from "@/components/RequireAuth";

export default function HRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowed={["hr"]}>
      <ERPLayout role="hr" title="HR Dashboard">
        {children}
      </ERPLayout>
    </RequireAuth>
  );
}
