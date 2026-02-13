"use client";

import { useMemo } from "react";

type Provider = {
  provider: "google" | "microsoft" | "okta" | "auth0";
};

const LABELS: Record<Provider["provider"], string> = {
  google: "Continue with Google Workspace",
  microsoft: "Continue with Microsoft 365",
  okta: "Continue with Okta",
  auth0: "Continue with Auth0",
};

export default function SSOLoginButtons({ tenantId, providers }: { tenantId: string; providers: Provider[] }) {
  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.provider === "google" || provider.provider === "microsoft"),
    [providers]
  );

  if (!enabledProviders.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {enabledProviders.map((provider) => (
        <a
          key={provider.provider}
          href={`/api/auth/sso/${provider.provider}/authorize?tenantId=${encodeURIComponent(tenantId)}&mode=login&returnTo=/`}
          className="btn ghost block w-full text-center"
        >
          {LABELS[provider.provider]}
        </a>
      ))}
    </div>
  );
}
