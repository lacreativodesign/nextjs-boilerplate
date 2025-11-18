// app/hr/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function HRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="hr" title="HR Dashboard">
      {children}
    </ERPLayout>
  );
}
