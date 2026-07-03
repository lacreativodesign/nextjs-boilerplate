'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { apiFetch } from '@/lib/api/client';

function postMetric(body: Record<string, unknown>) {
  void apiFetch('/api/monitoring/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export default function ClientMonitoring() {
  const pathname = usePathname();

  useEffect(() => {
    postMetric({
      type: 'active_session',
      activeUsers: 1,
      endpoint: pathname,
      module: 'frontend',
      metadata: {
        event: 'page_view',
      },
    });
  }, [pathname]);

  useReportWebVitals((metric) => {
    postMetric({
      type: 'web_vital',
      endpoint: pathname,
      module: 'frontend',
      webVitalName: metric.name,
      webVitalValue: metric.value,
      metadata: {
        id: metric.id,
        rating: metric.rating,
        navigationType: metric.navigationType,
      },
    });
  });

  return (
    <Script
      src="/_vercel/insights/script.js"
      strategy="afterInteractive"
      data-sdkn="@vercel/analytics/next"
    />
  );
}
