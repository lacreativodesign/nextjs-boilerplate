// app/am/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function AMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="am" title="Account Manager Dashboard">
      {children}
    </ERPLayout>
  );
}
