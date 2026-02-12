import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

/**
 * Serves the generated OpenAPI contract used by Swagger UI.
 */
export async function GET(): Promise<NextResponse<string>> {
  const specPath = path.join(process.cwd(), 'docs', 'api', 'openapi.yaml');
  const content = await readFile(specPath, 'utf8');

  return new NextResponse(content, {
    status: 200,
    headers: {
      'content-type': 'application/yaml; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
