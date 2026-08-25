import { SwaggerUi } from '@/components/docs/swagger-ui';

/**
 * API documentation page backed by generated OpenAPI contracts.
 */
export default function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <h1 className="page-title mb-2">API Documentation</h1>
      <p className="mb-8 text-sm text-gray-600">
        OpenAPI contracts are versioned and served from <code>/api/openapi?version=*</code>.
      </p>
      <SwaggerUi
        defaultVersion="v1"
        versions={[
          { label: 'v1 (current)', value: 'v1' },
          { label: 'v2 (planned)', value: 'v2' },
        ]}
      />
    </main>
  );
}
