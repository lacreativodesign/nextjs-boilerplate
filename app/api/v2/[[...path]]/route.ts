import { type NextRequest, NextResponse } from "next/server";
import { applyVersionHeaders } from "@/lib/api/versioning";

function resolveRequestedPath(path?: string[]) {
  if (!path?.length) return "/";
  return `/${path.join("/")}`;
}

async function handle(_request: NextRequest, context: { params: { path?: string[] } }) {
  const response = NextResponse.json(
    {
      ok: false,
      error: "API version v2 is not published yet.",
      requestedPath: resolveRequestedPath(context.params.path),
      migrationGuide: "/docs/api-changelog#v1-to-v2-migration-guide",
    },
    { status: 501 }
  );

  return applyVersionHeaders(response, "/api/v2");
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
