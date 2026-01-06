export const LEAD_STAGES = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;
export const LEAD_DISPOSITIONS = [
  "No Contact",
  "Not Answering",
  "Voicemail Left",
  "Call Back Scheduled",
  "Not Interested",
  "Wrong Number",
  "Bad Timing",
  "Email Sent",
  "Follow-Up Needed",
] as const;
export const LEAD_SOURCES = ["Website", "Manual", "Referral", "Other"] as const;
export const PIPELINE_STAGES = [...LEAD_STAGES] as const;
export const FOLLOW_UP_TYPES = ["Call", "Email", "Meeting"] as const;
export const FOLLOW_UP_STATUS = ["Open", "Done", "Overdue"] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function toInputDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function isOverdue(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getTime() < now.getTime();
}
