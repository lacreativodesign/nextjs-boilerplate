// app/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export default async function Home() {
  const session = cookies().get("lac_session")?.value;
  if (!session) redirect("/login");

  try {
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded?.uid;
    const snap = await adminDb.collection("users").doc(uid).get();
    const role = (snap.data()?.role || "").toLowerCase();

    const roleRoutes: Record<string, string> = {
      admin: "/admin",
      sales: "/sales",
      am: "/am",
      hr: "/hr",
      finance: "/finance",
      production: "/production",
      client: "/client",
    };

    const route = roleRoutes[role] || "/login";
    redirect(route);
  } catch (err) {
    redirect("/login");
  }
}
