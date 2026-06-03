"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 4000,
        className:
          "rounded-xl border border-[var(--toast-border)] bg-[var(--toast-bg)] text-[var(--toast-text)] shadow-lg transition-all duration-300 ease-out",
        style: {
          borderRadius: "12px",
          background: "var(--toast-bg)",
          color: "var(--toast-text)",
          boxShadow: "var(--toast-shadow)",
          fontFamily: "Inter, system-ui",
        },
      }}
    />
  );
}
