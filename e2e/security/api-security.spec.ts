import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface EndpointDef {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

const ENDPOINTS: EndpointDef[] = [
  { method: 'POST', path: '/api/admin/users/delete', body: { id: 'test' } },
  { method: 'POST', path: '/api/admin/projects/delete', body: { id: 'test' } },
  { method: 'GET', path: '/api/hr/documents/list' },
  { method: 'POST', path: '/api/hr/employees/create', body: {} },
];

test.describe('API security — unauthenticated requests', () => {
  for (const { method, path, body } of ENDPOINTS) {
    test(`${method} ${path} returns 401 without auth`, async ({ request }) => {
      let response;
      if (method === 'GET') {
        response = await request.get(`${BASE_URL}${path}`, { failOnStatusCode: false });
      } else {
        response = await request.post(`${BASE_URL}${path}`, {
          headers: { 'Content-Type': 'application/json' },
          data: body ?? {},
          failOnStatusCode: false,
        });
      }
      expect(response.status()).toBe(401);
    });
  }
});
