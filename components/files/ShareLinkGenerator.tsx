"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api/client";

export function ShareLinkGenerator({ fileId }: { fileId: string }) {
  const [shareLink, setShareLink] = useState("");

  const generate = async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const res = await apiFetch("/api/files/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, expiresAt, permissions: ["view", "download"] }),
    });
    const payload = await res.json();
    if (res.ok) {
      setShareLink(payload.shareLink || "");
    }
  };

  return (
    <div className="space-y-2">
      <button className="btn ghost" onClick={generate}>Generate share link</button>
      {shareLink ? <input className="input" readOnly value={shareLink} /> : null}
    </div>
  );
}
