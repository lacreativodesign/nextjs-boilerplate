const makeSearch = (key, noun, inputFields) => ({
  key,
  noun,
  display: { label: noun, description: noun },
  operation: {
    inputFields,
    perform: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.base_url}/api/zapier/searches/${key}`,
        headers: { 'x-api-key': bundle.authData.api_key },
        body: { input: bundle.inputData },
      });
      if (!response.data?.ok) throw new Error(response.data?.error || `${noun} failed.`);
      return response.data.result ? [response.data.result] : [];
    },
    sample: { id: 'sample' },
  },
});

module.exports = {
  find_client_by_email: makeSearch('find_client_by_email', 'Find Client by Email', [
    { key: 'email', required: true },
  ]),
  find_invoice_by_number: makeSearch('find_invoice_by_number', 'Find Invoice by Number', [
    { key: 'orderId', required: true },
  ]),
  find_project_by_name: makeSearch('find_project_by_name', 'Find Project by Name', [
    { key: 'projectName', required: true },
  ]),
};
