import { NextResponse } from "next/server";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    languages: SUPPORTED_LOCALES,
  });
}
