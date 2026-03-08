// app/api/me/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/serverAuth";

export async function GET() {
  const user = await getUserProfile();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
