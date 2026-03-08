const test = async (z, bundle) => {
  const response = await z.request({
    method: 'POST',
    url: `${bundle.authData.base_url}/api/zapier/auth`,
    headers: {
      'x-api-key': bundle.authData.api_key,
    },
  });

  if (!response.data?.ok) {
    throw new Error(response.data?.error || 'Authentication failed.');
  }

  return { tenantId: response.data.tenantId };
};

module.exports = {
  type: 'custom',
  test,
  fields: [
    { key: 'base_url', label: 'Bizosto Base URL', type: 'string', required: true, helpText: 'https://yourdomain.com' },
    { key: 'api_key', label: 'API Key', type: 'password', required: true },
  ],
  connectionLabel: '{{tenantId}}',
};
