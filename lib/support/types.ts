/**
 * Platform support / bug-report ticket model.
 *
 * `platform_tickets` is a TOP-LEVEL collection keyed by a `tenantId` field —
 * the same convention as `invoices`, `projects`, and `users`. This is what lets
 * the super admin read every tenant's tickets in a single query
 * (`adminDb.collection('platform_tickets').orderBy('createdAt', 'desc')`),
 * whereas the legacy per-tenant `tenants/{tenantId}/support_tickets` subcollection
 * is only visible one tenant at a time.
 *
 * Isolation rule (unchanged from the rest of the platform): the Admin SDK
 * bypasses Firestore security rules, so every read/write path MUST derive
 * `tenantId` from the authenticated session — never from the request body — and
 * filter by it. Firestore rules deny all client-SDK access to this collection;
 * it is served exclusively through Admin SDK API routes.
 */

export const PLATFORM_TICKETS_COLLECTION = 'platform_tickets';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'bug' | 'feature' | 'question' | 'billing' | 'other';

/**
 * Triage runs super-admin-side, on demand — never on the tenant write path, so
 * no platform AI key is ever reachable from a tenant-facing route. A ticket is
 * born `untriaged`; the super admin explicitly triggers analysis, which is what
 * bounds AI cost to deliberate clicks rather than inbound ticket volume.
 */
export type TriageStatus = 'untriaged' | 'analyzing' | 'analyzed' | 'failed';

/** Where triage thinks the fix belongs. */
export type FixKind = 'data_fix' | 'code_fix' | 'answer' | 'unknown';

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;

export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'bug',
  'feature',
  'question',
  'billing',
  'other',
] as const;

export function parseTicketStatus(input: unknown): TicketStatus | null {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'open') return 'open';
  if (raw === 'in_progress' || raw === 'in progress' || raw === 'inprogress') return 'in_progress';
  if (raw === 'resolved' || raw === 'resolve' || raw === 'fixed') return 'resolved';
  if (raw === 'closed' || raw === 'close') return 'closed';
  return null;
}

export function normalizeTicketStatus(input: unknown): TicketStatus {
  return parseTicketStatus(input) ?? 'open';
}

export function parseTicketPriority(input: unknown): TicketPriority | null {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'low') return 'low';
  if (raw === 'medium' || raw === 'normal') return 'medium';
  if (raw === 'high') return 'high';
  if (raw === 'urgent' || raw === 'critical') return 'urgent';
  return null;
}

export function normalizeTicketPriority(input: unknown): TicketPriority {
  return parseTicketPriority(input) ?? 'medium';
}

export function parseTicketCategory(input: unknown): TicketCategory | null {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'bug') return 'bug';
  if (raw === 'feature' || raw === 'feature_request') return 'feature';
  if (raw === 'question' || raw === 'help') return 'question';
  if (raw === 'billing' || raw === 'payment') return 'billing';
  if (raw === 'other') return 'other';
  return null;
}

export function normalizeTicketCategory(input: unknown): TicketCategory {
  return parseTicketCategory(input) ?? 'question';
}

/** Immutable record of who filed the ticket, captured from the session at write time. */
export type TicketReporter = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

/** Optional triage verdict attached by the super-admin-side analyzer. */
export type TicketTriage = {
  summary: string;
  fixKind: FixKind;
  suggestedPriority: TicketPriority;
  /** Model identifier used, for cost/audit transparency. */
  model: string;
  /** For code_fix: a ready-to-run Claude Code prompt the super admin can copy. */
  claudeCodePrompt: string | null;
  /** For data_fix: a plain-language description of the proposed change. */
  dataFixProposal: string | null;
  createdAt: string;
};

/** Canonical persisted shape of a platform ticket document. */
export type PlatformTicket = {
  id: string;
  tenantId: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  triageStatus: TriageStatus;
  triage: TicketTriage | null;
  pageUrl: string | null;
  screenshotUrl: string | null;
  hasScreenshot: boolean;
  reporter: TicketReporter;
  assignedTo: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
