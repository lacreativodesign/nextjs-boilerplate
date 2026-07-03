export const ACTIVITY_ACTION_TYPES = [
  'created',
  'updated',
  'deleted',
  'commented',
  'assigned',
] as const;

export type ActivityActionType = (typeof ACTIVITY_ACTION_TYPES)[number];

export type ActivityEntityType =
  | 'invoice'
  | 'client'
  | 'project'
  | 'task'
  | 'comment'
  | 'document'
  | 'user'
  | 'payment'
  | 'system';

export interface ActivityActor {
  uid: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

export interface ActivityMetadata {
  module: string;
  description?: string;
  route?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ActivityRecord {
  id: string;
  tenantId: string;
  actor: ActivityActor;
  action: ActivityActionType;
  entity: {
    type: ActivityEntityType;
    id: string;
    name?: string;
  };
  metadata: ActivityMetadata;
  createdAt: string;
}

export interface ActivityFilters {
  module?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export interface PresenceRecord {
  uid: string;
  name: string;
  email?: string | null;
  role?: string | null;
  online: boolean;
  lastSeenAt: number;
}
