const DAY_MS = 24 * 60 * 60 * 1000;

export type StageHistoryEntry = {
  from?: string;
  to?: string;
  at?: string | Date | { toDate?: () => Date } | null;
};

type SlaInputs = {
  createdAt?: string | Date | { toDate?: () => Date } | null;
  updatedAt?: string | Date | { toDate?: () => Date } | null;
  stage?: string | null;
  stageHistory?: StageHistoryEntry[] | null;
  slaDaysTotal: number;
  now?: Date;
};

function toDate(value?: SlaInputs["createdAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof (value as any)?.toDate === "function") {
    const parsed = (value as any).toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function resolveKickoffAt(inputs: SlaInputs): Date | null {
  const history = Array.isArray(inputs.stageHistory) ? inputs.stageHistory : [];
  const kickoffEntry = history.find((entry) => String(entry?.to || "") === "Kickoff");
  return toDate(kickoffEntry?.at) || toDate(inputs.createdAt) || toDate(inputs.updatedAt);
}

function resolveDeliveredAt(inputs: SlaInputs): Date | null {
  const history = Array.isArray(inputs.stageHistory) ? inputs.stageHistory : [];
  const deliveredEntry = [...history].reverse().find((entry) => String(entry?.to || "") === "Delivered");
  return toDate(deliveredEntry?.at) || null;
}

export function getSlaTotalDays(slaDaysPerStage: Record<string, number> | null | undefined) {
  if (!slaDaysPerStage) return 0;
  return Object.entries(slaDaysPerStage).reduce((sum, [stage, days]) => {
    if (stage === "Delivered") return sum;
    const value = Number(days || 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

export function computeSlaFields(inputs: SlaInputs) {
  const kickoffAt = resolveKickoffAt(inputs);
  if (!kickoffAt) {
    return {
      slaDueAt: null,
      isOverdue: false,
      daysOverdue: 0,
    };
  }

  const now = inputs.now || new Date();
  const deliveredAt = resolveDeliveredAt(inputs);
  const endAt = deliveredAt || now;
  const history = Array.isArray(inputs.stageHistory) ? inputs.stageHistory : [];
  const timeline = history
    .map((entry) => ({
      at: toDate(entry?.at),
      to: String(entry?.to || ""),
    }))
    .filter((entry) => entry.at)
    .sort((a, b) => (a.at as Date).getTime() - (b.at as Date).getTime());

  let pausedMs = 0;
  let currentStage = "Kickoff";
  let lastAt = kickoffAt;

  timeline.forEach((entry) => {
    const at = entry.at as Date;
    if (at < lastAt) return;
    if (currentStage === "Review") {
      pausedMs += at.getTime() - lastAt.getTime();
    }
    currentStage = entry.to || currentStage;
    lastAt = at;
  });

  if (currentStage === "Review" && endAt > lastAt) {
    pausedMs += endAt.getTime() - lastAt.getTime();
  }

  const totalMs = endAt.getTime() - kickoffAt.getTime();
  const activeMs = Math.max(0, totalMs - pausedMs);
  const activeDays = activeMs / DAY_MS;

  const slaDaysTotal = Math.max(0, Number(inputs.slaDaysTotal || 0));
  const slaDueAt = new Date(kickoffAt.getTime() + slaDaysTotal * DAY_MS + pausedMs);
  const overdueMs = endAt.getTime() - slaDueAt.getTime();
  const isOverdue = overdueMs > 0;
  const daysOverdue = isOverdue ? Math.ceil(overdueMs / DAY_MS) : 0;

  return {
    slaDueAt,
    isOverdue,
    daysOverdue,
    activeDays,
  };
}
