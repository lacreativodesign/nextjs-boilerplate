import { NextResponse } from "next/server";

const COOKIE_NAME = "lac_session";

export async function POST(req: Request) {
  const res = NextResponse.json({ success: true });
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const isSecure = forwardedProto === "https" || process.env.NODE_ENV === "production";

  // Clear lac_session cookie
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return res;
}
