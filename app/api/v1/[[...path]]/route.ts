import type { NextRequest } from "next/server";
import { applyVersionHeaders, proxyVersionedRequest } from "@/lib/api/versioning";

function toUnversionedPath(path: string[] | undefined) {
  if (!path || path.length === 0) return "/api";
  return `/api/${path.join("/")}`;
}

async function handle(request: NextRequest, context: { params: { path?: string[] } }) {
  const targetPath = toUnversionedPath(context.params.path);
  const response = await proxyVersionedRequest(request, targetPath);
  return applyVersionHeaders(response, "/api/v1");
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
