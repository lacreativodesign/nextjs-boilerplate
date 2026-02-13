const makeTrigger = (key, noun) => ({
  key,
  noun,
  display: { label: noun, description: `Triggers when ${noun.toLowerCase()}.` },
  operation: {
    type: 'hook',
    inputFields: [],
    performSubscribe: async (z, bundle) => {
      const response = await z.request({
        method: 'POST',
        url: `${bundle.authData.base_url}/api/zapier/hooks/subscribe`,
        headers: { 'x-api-key': bundle.authData.api_key },
        body: {
          triggerKey: key,
          targetUrl: bundle.targetUrl,
        },
      });

      if (!response.data?.ok) throw new Error(response.data?.error || 'Subscribe failed.');
      return { id: response.data.id };
    },
    performUnsubscribe: async (z, bundle) => {
      const response = await z.request({
        method: 'DELETE',
        url: `${bundle.authData.base_url}/api/zapier/hooks/${bundle.subscribeData.id}/unsubscribe`,
        headers: { 'x-api-key': bundle.authData.api_key },
      });
      if (!response.data?.ok) throw new Error(response.data?.error || 'Unsubscribe failed.');
      return response.data;
    },
    perform: (z, bundle) => [bundle.cleanedRequest],
    performList: () => [],
    sample: { id: 'sample_event' },
  },
});

module.exports = {
  new_invoice_created: makeTrigger('new_invoice_created', 'New Invoice Created'),
  invoice_paid: makeTrigger('invoice_paid', 'Invoice Paid'),
  new_client_added: makeTrigger('new_client_added', 'New Client Added'),
  task_completed: makeTrigger('task_completed', 'Task Completed'),
  project_status_changed: makeTrigger('project_status_changed', 'Project Status Changed'),
  payment_received: makeTrigger('payment_received', 'Payment Received'),
  leave_request_submitted: makeTrigger('leave_request_submitted', 'Leave Request Submitted'),
};
