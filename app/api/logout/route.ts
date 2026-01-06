import { NextResponse } from "next/server";

const COOKIE_NAME = "lac_session";
const ROLE_COOKIE_NAME = "lac_role";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export async function POST() {
  const res = NextResponse.json({ success: true });

  // Clear lac_session cookie
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set({
    name: ROLE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (COOKIE_DOMAIN) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
      maxAge: 0,
    });
    res.cookies.set({
      name: ROLE_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
      maxAge: 0,
    });
  }

  return res;
}
