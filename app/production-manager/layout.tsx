"use client";

import RequireAuth from "@/components/RequireAuth";
import { ROUTE_ROLE_ACCESS } from "@/lib/auth/roles";

export default function ProductionManagerLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth allowed={ROUTE_ROLE_ACCESS["/production-manager"]}>{children}</RequireAuth>;
}
