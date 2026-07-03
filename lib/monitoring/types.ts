export type MonitoringSeverity = 'debug' | 'info' | 'warn' | 'error';

export type MonitoringMetricType =
  | 'api_response_time'
  | 'database_query_duration'
  | 'cache_event'
  | 'active_session'
  | 'error_event'
  | 'conversion_event'
  | 'web_vital';

export type MonitoringModule =
  | 'api'
  | 'database'
  | 'cache'
  | 'auth'
  | 'billing'
  | 'frontend'
  | 'unknown';

export type MetricIngestPayload = {
  type: MonitoringMetricType;
  endpoint?: string;
  module?: MonitoringModule;
  durationMs?: number;
  cacheResult?: 'hit' | 'miss';
  activeUsers?: number;
  errorCode?: string;
  conversionStage?: 'trial' | 'paid';
  webVitalName?: 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB';
  webVitalValue?: number;
  metadata?: Record<string, unknown>;
};

export type MonitoringAlertChannel = 'slack' | 'email' | 'pagerduty' | 'immediate';

export type MonitoringAlertRule = {
  id: string;
  label: string;
  channel: MonitoringAlertChannel;
  threshold: number;
  comparison: '>' | '<';
  metricKey: 'errorRate' | 'responseTimeP95' | 'databaseCpu' | 'diskAvailable';
};

export type MonitoringAlertState = MonitoringAlertRule & {
  active: boolean;
  lastTriggeredAt: string | null;
  currentValue: number;
};

export type MonitoringDashboardPayload = {
  generatedAt: string;
  windows: Array<{
    bucket: string;
    responseTimeP95: number;
    errorRate: number;
    databaseQueryP95: number;
    cacheHitRate: number;
    activeUsers: number;
  }>;
  summary: {
    responseTimeP95: number;
    errorRate: number;
    activeUsers: number;
    cacheHitRate: number;
    databaseQueryP95: number;
    conversionTrialToPaidRate: number;
    rumPageViews: number;
  };
  endpointMetrics: Array<{
    endpoint: string;
    p95ResponseMs: number;
    errorRate: number;
    requests: number;
  }>;
  moduleErrorRates: Array<{
    module: MonitoringModule;
    errorRate: number;
    errors: number;
    events: number;
  }>;
  alerts: MonitoringAlertState[];
};
