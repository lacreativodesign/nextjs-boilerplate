// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "LA CREATIVO PORTAL",
  description: "Unified Dashboard System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
