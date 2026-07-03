import fs from 'node:fs/promises';
import path from 'node:path';

const API_ROOT = path.resolve('app/api');
const OUTPUT_PATH = path.resolve('docs/api/openapi.yaml');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

/**
 * Recursively collects API route files from App Router API directory.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectRouteFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      routes.push(...(await collectRouteFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === 'route.ts') {
      routes.push(fullPath);
    }
  }

  return routes;
}

/**
 * Derives HTTP methods exported by route implementation.
 * @param {string} content
 * @returns {string[]}
 */
function extractMethods(content) {
  return HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`, 'm').test(content),
  );
}

/**
 * Maps route file path into OpenAPI endpoint path.
 * @param {string} routeFile
 * @returns {string}
 */
function toOpenApiPath(routeFile) {
  const relative = path.relative(API_ROOT, path.dirname(routeFile));
  if (!relative) {
    return '/api';
  }

  return `/api/${relative.split(path.sep).join('/')}`;
}

/**
 * Converts Next.js dynamic route segment to OpenAPI syntax.
 * @param {string} routePath
 * @returns {string}
 */
function normalizeDynamicSegments(routePath) {
  return routePath.replace(/\[(.+?)\]/g, '{$1}');
}

/**
 * Creates deterministic OpenAPI YAML content.
 * @param {{ path: string; methods: string[] }[]} endpoints
 * @returns {string}
 */
function createYaml(endpoints) {
  const lines = [
    'openapi: 3.0.3',
    'info:',
    '  title: Bizosto ERP API',
    '  version: 1.0.0',
    '  description: >-',
    '    Multi-tenant API contract generated from App Router route handlers.',
    'servers:',
    '  - url: /',
    'security:',
    '  - BearerAuth: []',
    'tags:',
    '  - name: Auth',
    '  - name: Tenant',
    '  - name: Core',
    'paths:',
  ];

  for (const endpoint of endpoints) {
    lines.push(`  ${endpoint.path}:`);

    for (const method of endpoint.methods) {
      const methodKey = method.toLowerCase();
      lines.push(`    ${methodKey}:`);
      lines.push(`      summary: ${method} ${endpoint.path}`);
      lines.push('      tags:');
      lines.push(
        `        - ${endpoint.path.startsWith('/api/auth') ? 'Auth' : endpoint.path.startsWith('/api/tenant') ? 'Tenant' : 'Core'}`,
      );
      lines.push('      responses:');
      lines.push("        '200':");
      lines.push('          description: Request completed successfully.');
      lines.push("        '401':");
      lines.push('          description: Unauthorized or invalid session.');
      lines.push("        '403':");
      lines.push('          description: Forbidden for current tenant or role.');
    }
  }

  lines.push('components:');
  lines.push('  securitySchemes:');
  lines.push('    BearerAuth:');
  lines.push('      type: http');
  lines.push('      scheme: bearer');
  lines.push('      bearerFormat: JWT');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const files = await collectRouteFiles(API_ROOT);
  const endpoints = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const methods = extractMethods(content);
    if (!methods.length) {
      continue;
    }

    endpoints.push({
      path: normalizeDynamicSegments(toOpenApiPath(file)),
      methods,
    });
  }

  endpoints.sort((a, b) => a.path.localeCompare(b.path));
  const yaml = createYaml(endpoints);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, yaml, 'utf8');

  process.stdout.write(
    `Generated OpenAPI spec with ${endpoints.length} endpoints at ${OUTPUT_PATH}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
