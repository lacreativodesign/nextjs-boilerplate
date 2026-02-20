"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const key = useMemo(() => `${pathname}?${searchParams?.toString() ?? ""}`, [pathname, searchParams]);

  useEffect(() => {
    setVisible(true);
    setProgress(15);

    const t1 = window.setTimeout(() => setProgress(60), 160);
    const t2 = window.setTimeout(() => setProgress(85), 320);
    const t3 = window.setTimeout(() => setProgress(100), 520);
    const t4 = window.setTimeout(() => setVisible(false), 700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [key]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none bg-transparent"
      style={{ position: "fixed", top: 0, left: 0, right: 0, width: "100%", zIndex: 9999, height: "3px" }}
    >
      <div
        className="h-full bg-indigo-500 transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
