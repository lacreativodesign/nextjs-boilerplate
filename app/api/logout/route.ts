import { NextResponse } from "next/server";
import { COOKIE_DOMAIN, IS_PRODUCTION } from "@/lib/env";

const COOKIE_NAME = "lac_session";

export async function POST() {
  const res = NextResponse.json({ success: true });

  // Clear lac_session cookie
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: 0,
  });

  return res;
}
