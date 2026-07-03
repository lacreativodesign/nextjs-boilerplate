import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const OPENAPI_FILES: Record<string, string> = {
  v1: 'openapi.v1.yaml',
  v2: 'openapi.v2.yaml',
};

/**
 * Serves OpenAPI contracts per version.
 */
export async function GET(request: NextRequest): Promise<NextResponse<string>> {
  const version = request.nextUrl.searchParams.get('version') || 'v1';
  const fileName = OPENAPI_FILES[version] || OPENAPI_FILES.v1;
  const specPath = path.join(process.cwd(), 'docs', 'api', fileName);
  const content = await readFile(specPath, 'utf8');

  return new NextResponse(content, {
    status: 200,
    headers: {
      'content-type': 'application/yaml; charset=utf-8',
      'cache-control': 'no-store',
      'x-api-spec-version': version,
    },
  });
}
