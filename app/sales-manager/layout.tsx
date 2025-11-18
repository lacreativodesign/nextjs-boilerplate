// app/sales-manager/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="sales-manager" title="Sales Manager Dashboard">
      {children}
    </ERPLayout>
  );
}
