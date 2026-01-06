"use client";

import RequireAuth from "@/components/RequireAuth";
import { ROUTE_ROLE_ACCESS } from "@/lib/auth/roles";

export default function AMManagerLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth allowed={ROUTE_ROLE_ACCESS["/am-manager"]}>{children}</RequireAuth>;
}
