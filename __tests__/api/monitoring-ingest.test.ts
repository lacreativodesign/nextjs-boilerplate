import { jsonRequest } from './test-utils/request';

const ingestMetric = jest.fn(async (_p: Record<string, unknown>) => undefined);
jest.mock('@/lib/monitoring/dashboard-service', () => ({
  ingestMetric: (p: Record<string, unknown>) => ingestMetric(p),
}));

describe('monitoring ingest hardening', () => {
  beforeEach(() => ingestMetric.mockClear());

  it('rejects an invalid metric type', async () => {
    const { POST } = await import('@/app/api/monitoring/ingest/route');
    const res = await POST(
      jsonRequest('https://app.local/api/monitoring/ingest', { type: 'not_a_type' }),
    );
    expect(res.status).toBe(400);
    expect(ingestMetric).not.toHaveBeenCalled();
  });

  it('accepts a valid web_vital and only forwards whitelisted, bounded fields', async () => {
    const { POST } = await import('@/app/api/monitoring/ingest/route');
    const res = await POST(
      jsonRequest('https://app.local/api/monitoring/ingest', {
        type: 'web_vital',
        webVitalName: 'LCP',
        webVitalValue: 1234,
        endpoint: 'x'.repeat(1000),
        module: 'not_a_module',
        injectedField: 'should_be_dropped',
      }),
    );
    expect(res.status).toBe(202);
    const forwarded = ingestMetric.mock.calls[0][0] as Record<string, unknown>;
    expect(forwarded.type).toBe('web_vital');
    expect(forwarded.webVitalName).toBe('LCP');
    // string capped to 256, unknown enum dropped, injected field dropped
    expect((forwarded.endpoint as string).length).toBe(256);
    expect(forwarded.module).toBeUndefined();
    expect(forwarded.injectedField).toBeUndefined();
  });

  it('drops oversized metadata but still ingests', async () => {
    const { POST } = await import('@/app/api/monitoring/ingest/route');
    const big = { blob: 'y'.repeat(5000) };
    const res = await POST(
      jsonRequest('https://app.local/api/monitoring/ingest', {
        type: 'error_event',
        errorCode: 'E1',
        metadata: big,
      }),
    );
    expect(res.status).toBe(202);
    const forwarded = ingestMetric.mock.calls[0][0] as Record<string, unknown>;
    expect(forwarded.metadata).toBeUndefined();
    expect(forwarded.errorCode).toBe('E1');
  });
});
