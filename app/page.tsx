// app/page.tsx
import React from "react";
import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 24 }}>
      <h3>LA CREATIVO ERP</h3>
      <p><Link href="/login">Go to Login</Link></p>
    </div>
  );
}
