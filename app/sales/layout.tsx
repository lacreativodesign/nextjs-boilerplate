// app/sales/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="sales" title="Sales Dashboard">
      {children}
    </ERPLayout>
  );
}
