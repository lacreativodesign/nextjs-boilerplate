import { monitoringLogger } from "@/lib/monitoring/logger";
import type { MonitoringAlertRule, MonitoringAlertState } from "@/lib/monitoring/types";

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const alertTriggerCache = new Map<string, number>();

export const defaultAlertRules: MonitoringAlertRule[] = [
  {
    id: "error-rate-high",
    label: "Error rate > 1%",
    channel: "slack",
    threshold: 1,
    comparison: ">",
    metricKey: "errorRate",
  },
  {
    id: "response-time-high",
    label: "P95 response time > 1000ms",
    channel: "email",
    threshold: 1000,
    comparison: ">",
    metricKey: "responseTimeP95",
  },
  {
    id: "database-cpu-high",
    label: "Database CPU > 80%",
    channel: "pagerduty",
    threshold: 80,
    comparison: ">",
    metricKey: "databaseCpu",
  },
  {
    id: "disk-space-low",
    label: "Disk space < 10%",
    channel: "immediate",
    threshold: 10,
    comparison: "<",
    metricKey: "diskAvailable",
  },
];

type AlertMetrics = {
  errorRate: number;
  responseTimeP95: number;
  databaseCpu: number;
  diskAvailable: number;
};

function compare(rule: MonitoringAlertRule, value: number) {
  return rule.comparison === ">" ? value > rule.threshold : value < rule.threshold;
}

async function sendNotification(channel: MonitoringAlertRule["channel"], message: string) {
  const webhookUrl =
    channel === "slack"
      ? process.env.MONITORING_SLACK_WEBHOOK_URL
      : channel === "pagerduty"
        ? process.env.MONITORING_PAGERDUTY_WEBHOOK_URL
        : channel === "email"
          ? process.env.MONITORING_EMAIL_WEBHOOK_URL
          : process.env.MONITORING_IMMEDIATE_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    await monitoringLogger.warn("monitoring_alert_channel_not_configured", "monitoring", {
      channel,
      message,
    });
    return;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message,
      channel,
      source: "bizosto-monitoring",
      sentAt: new Date().toISOString(),
    }),
    cache: "no-store",
  });
}

export async function evaluateAlertStates(metrics: AlertMetrics): Promise<MonitoringAlertState[]> {
  const now = Date.now();

  const states = await Promise.all(
    defaultAlertRules.map(async (rule) => {
      const currentValue = metrics[rule.metricKey];
      const active = compare(rule, currentValue);
      const state: MonitoringAlertState = {
        ...rule,
        active,
        currentValue,
        lastTriggeredAt: null,
      };

      if (!active) {
        return state;
      }

      const cacheKey = `MONITOR_ALERT_${rule.id}`;
      const previous = alertTriggerCache.get(cacheKey);
      if (previous && now - previous < ALERT_COOLDOWN_MS) {
        state.lastTriggeredAt = new Date(previous).toISOString();
        return state;
      }

      const triggeredAt = new Date(now).toISOString();
      alertTriggerCache.set(cacheKey, now);
      state.lastTriggeredAt = triggeredAt;

      const message = `[${rule.channel.toUpperCase()}] ${rule.label}. Current value=${currentValue.toFixed(2)}, threshold=${rule.threshold}`;
      await sendNotification(rule.channel, message);
      await monitoringLogger.warn("monitoring_alert_triggered", "monitoring", {
        ruleId: rule.id,
        channel: rule.channel,
        currentValue,
        threshold: rule.threshold,
      });

      return state;
    })
  );

  return states;
}
