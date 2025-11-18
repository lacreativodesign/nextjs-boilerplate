// app/client/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ERPLayout role="client" title="Client Dashboard">
      {children}
    </ERPLayout>
  );
}
