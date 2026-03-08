const endpoints = [
  '/api/auth/me',
  '/api/users',
  '/api/clients',
  '/api/leads',
  '/api/deals',
  '/api/projects',
  '/api/invoices',
  '/api/hr/employees',
  '/api/finance/overview',
  '/api/production/overview',
  '/api/notifications/list',
  '/api/documents',
  '/api/reports',
];

async function testEndpoints() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  console.log('Testing API endpoints...\n');

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      const status = response.status;

      if (status === 401 || status === 403) {
        console.log(`✅ ${endpoint} - Protected (${status})`);
      } else if (status >= 200 && status < 300) {
        console.log(`✅ ${endpoint} - OK (${status})`);
      } else if (status >= 400) {
        console.log(`❌ ${endpoint} - ERROR (${status})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${endpoint} - FAILED: ${message}`);
    }
  }
}

testEndpoints();
