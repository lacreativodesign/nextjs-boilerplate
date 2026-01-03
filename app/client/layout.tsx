// app/client/layout.tsx
"use client";

import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";
import RequireAuth from "@/components/RequireAuth";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowed={["client"]}>
      <ERPLayout role="client" title="Client Dashboard">
        {children}
      </ERPLayout>
    </RequireAuth>
  );
}
