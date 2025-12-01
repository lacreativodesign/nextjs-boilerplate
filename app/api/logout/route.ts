import { NextResponse } from "next/server";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com";

export async function POST() {
  const res = NextResponse.json({ success: true });

  // Clear lac_session cookie
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: 0,
  });

  return res;
}
