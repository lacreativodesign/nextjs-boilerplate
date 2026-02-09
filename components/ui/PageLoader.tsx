"use client";

import React, { useEffect, useState } from "react";
import Spinner from "@/components/ui/Spinner";

type PageLoaderProps = {
  message?: string;
  delay?: number;
};

export default function PageLoader({ message = "Loading...", delay = 200 }: PageLoaderProps) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/10 text-center backdrop-blur-sm transition-opacity fade-in">
      <Spinner size="lg" />
      {message ? <div className="text-sm font-medium text-[var(--text-primary)]">{message}</div> : null}
    </div>
  );
}
