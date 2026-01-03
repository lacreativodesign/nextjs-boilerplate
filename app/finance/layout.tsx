// app/finance/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";
import RequireAuth from "@/components/RequireAuth";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowed={["finance"]}>
      <ERPLayout role="finance" title="Finance Dashboard">
        {children}
      </ERPLayout>
    </RequireAuth>
  );
}
