// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/serverAuth";

export async function GET() {
  const me = await getUserProfile();
  if (!me) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...me });
}
