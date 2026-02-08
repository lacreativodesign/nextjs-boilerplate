import "./globals.css";
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
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}
