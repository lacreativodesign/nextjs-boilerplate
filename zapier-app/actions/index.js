const makeAction = (key, noun, inputFields) => ({
  key,
  noun,
  display: { label: noun, description: noun },
  operation: {
    inputFields,
    perform: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.base_url}/api/zapier/actions/${key}`,
        headers: { 'x-api-key': bundle.authData.api_key },
        body: { input: bundle.inputData },
      });
      if (!response.data?.ok) throw new Error(response.data?.error || `${noun} failed.`);
      return response.data.result;
    },
    sample: { id: 'sample' },
  },
});

module.exports = {
  create_invoice: makeAction('create_invoice', 'Create Invoice', [{ key: 'clientId', required: true }, { key: 'clientName', required: true }, { key: 'amountTotal', required: true }]),
  create_client: makeAction('create_client', 'Create Client', [{ key: 'companyName', required: true }, { key: 'primaryContactEmail', required: true }]),
  create_task: makeAction('create_task', 'Create Task', [{ key: 'projectId', required: true }, { key: 'title', required: true }]),
  create_project: makeAction('create_project', 'Create Project', [{ key: 'projectName', required: true }, { key: 'clientId', required: true }]),
  update_invoice_status: makeAction('update_invoice_status', 'Update Invoice Status', [{ key: 'invoiceId', required: true }, { key: 'status', required: true }]),
  send_notification: makeAction('send_notification', 'Send Notification', [{ key: 'title', required: true }, { key: 'body', required: true }]),
};
