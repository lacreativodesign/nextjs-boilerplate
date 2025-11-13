import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com"; // works across all subdomains

export async function POST() {
  const c = cookies();

  // Clear cookie
  c.set({
    name: COOKIE_NAME,
    value: "",
    path: "/",
    domain: COOKIE_DOMAIN,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });

  // Redirect back to login after clearing session
  const res = NextResponse.json({ ok: true });
  res.headers.set("Clear-Site-Data", '"cookies"');
  return res;
}
