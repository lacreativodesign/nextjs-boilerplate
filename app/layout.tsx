import "./globals.css";
import { Suspense } from "react";
import ToastProvider from "@/components/providers/ToastProvider";
import RouteProgress from "@/components/ui/RouteProgress";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ToastProvider />
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
