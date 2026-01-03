// app/sales-manager/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";
import RequireAuth from "@/components/RequireAuth";

export default function SalesManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowed={["sales_manager"]}>
      <ERPLayout role="sales-manager" title="Sales Manager Dashboard">
        {children}
      </ERPLayout>
    </RequireAuth>
  );
}
