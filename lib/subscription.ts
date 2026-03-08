export type SubscriptionState = "active" | "grace" | "soft_locked" | "hard_locked";

const VALID_STATES: SubscriptionState[] = ["active", "grace", "soft_locked", "hard_locked"];

export function normalizeSubscriptionState(value: unknown): SubscriptionState {
  const normalized = String(value || "").toLowerCase();
  return VALID_STATES.includes(normalized as SubscriptionState) ? (normalized as SubscriptionState) : "active";
}

export function deriveSubscriptionState({
  subscriptionState,
  billingStatus,
}: {
  subscriptionState?: unknown;
  billingStatus?: unknown;
}): SubscriptionState {
  if (subscriptionState) {
    return normalizeSubscriptionState(subscriptionState);
  }

  const normalizedBilling = String(billingStatus || "").toLowerCase();
  if (normalizedBilling === "past_due") return "grace";
  if (normalizedBilling === "canceled") return "hard_locked";
  return "active";
}

export function isReadOnlySubscription(state: SubscriptionState) {
  return state === "soft_locked";
}

export function isHardLockedSubscription(state: SubscriptionState) {
  return state === "hard_locked";
}

export function isNonActiveSubscription(state: SubscriptionState) {
  return state !== "active";
}

export function getSubscriptionBannerCopy(state: SubscriptionState) {
  switch (state) {
    case "grace":
      return {
        title: "Subscription past due",
        message: "Your plan is in grace period. Update billing to avoid a lock.",
      };
    case "soft_locked":
      return {
        title: "Read-only mode",
        message: "Your subscription is paused. Updates are disabled until billing is restored.",
      };
    case "hard_locked":
      return {
        title: "Subscription locked",
        message: "Access is restricted. Update billing to restore full access.",
      };
    default:
      return {
        title: "Subscription active",
        message: "",
      };
  }
}
