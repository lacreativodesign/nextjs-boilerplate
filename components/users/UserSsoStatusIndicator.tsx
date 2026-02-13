"use client";

import { useEffect, useMemo, useState } from "react";

type Provider = "google" | "microsoft";

export default function UserSsoStatusIndicator() {
  const [providers, setProviders] = useState<string[]>([]);
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "default";

  useEffect(() => {
    let active = true;
    fetch("/api/auth/sso/status", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok) return;
        setProviders(Object.keys(data.providers || {}));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const availableToLink = useMemo(
    () => (["google", "microsoft"] as Provider[]).filter((provider) => !providers.includes(provider)),
    [providers]
  );

  return (
    <div className="space-y-2 text-xs text-[var(--sidebar-text)]">
      <div>SSO: {providers.length ? providers.join(", ") : "Not linked"}</div>
      <div className="flex flex-wrap gap-2">
        {availableToLink.map((provider) => (
          <a
            key={provider}
            className="btn ghost"
            href={`/api/auth/sso/${provider}/authorize?tenantId=${encodeURIComponent(tenantId)}&mode=link&returnTo=/admin/settings/sso`}
          >
            Link {provider}
          </a>
        ))}
      </div>
    </div>
  );
}
