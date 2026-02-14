"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";

const DEFAULT_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nMTInIHZpZXdCb3g9JzAgMCAxNiAxMicgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nMTYnIGhlaWdodD0nMTInIGZpbGw9JyNlNWU3ZWInLz48L3N2Zz4=";

export type OptimizedImageProps = Omit<ImageProps, "placeholder"> & {
  blurDataURL?: string;
  disableManualLazy?: boolean;
};

export function OptimizedImage({
  blurDataURL = DEFAULT_BLUR_DATA_URL,
  priority = false,
  disableManualLazy = false,
  sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
  className,
  alt,
  ...props
}: OptimizedImageProps) {
  const [isInView, setIsInView] = useState(priority || disableManualLazy);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (priority || disableManualLazy || isInView) return;
    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [disableManualLazy, isInView, priority]);

  return (
    <div ref={containerRef}>
      {isInView ? (
        <Image
          {...props}
          alt={alt}
          priority={priority}
          sizes={sizes}
          placeholder="blur"
          blurDataURL={blurDataURL}
          className={className}
        />
      ) : (
        <div className={`animate-pulse rounded bg-[var(--surface-muted)] ${className || ""}`} aria-hidden />
      )}
    </div>
  );
}
