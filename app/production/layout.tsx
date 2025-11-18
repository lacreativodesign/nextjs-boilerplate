// app/production/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function ProductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="production" title="Production Dashboard">
      {children}
    </ERPLayout>
  );
}
