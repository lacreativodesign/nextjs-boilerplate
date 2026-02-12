import { SwaggerUi } from '@/components/docs/swagger-ui';

/**
 * API documentation page backed by generated OpenAPI contract.
 */
export default function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-semibold">API Documentation</h1>
      <p className="mb-8 text-sm text-gray-600">
        OpenAPI contract is generated from App Router route handlers via `npm run docs:api`.
      </p>
      <SwaggerUi specUrl="/api/openapi" />
    </main>
  );
}
