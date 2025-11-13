// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginPage from "./login/page"; // reuse your existing client login UI
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export default async function Home() {
  const session = cookies().get("lac_session")?.value;

  // Not signed in? Render login right on "/"
  if (!session) return <LoginPage />;

  // Signed in → read role and route accordingly
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;
    const snap = await adminDb.collection("users").doc(uid).get();
    const role = (snap.data()?.role || "").toString().toLowerCase();

    const routes: Record<string, string> = {
      admin: "/admin",
      sales: "/sales",
      am: "/am",
      hr: "/hr",
      finance: "/finance",
      production: "/production",
      client: "/client",
    };

    redirect(routes[role] ?? "/login");
  } catch {
    redirect("/login");
  }
}
