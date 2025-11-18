// app/finance/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="finance" title="Finance Dashboard">
      {children}
    </ERPLayout>
  );
}
