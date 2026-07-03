export type WorkflowStatus = 'active' | 'disabled';
export type WorkflowTriggerType = 'manual' | 'scheduled' | 'event';
export type WorkflowEventName = 'record_created' | 'record_updated' | 'field_changed';

export type WorkflowTrigger =
  | { type: 'manual' }
  | { type: 'scheduled'; cron: string; timezone?: string }
  | { type: 'event'; event: WorkflowEventName; entity: string; field?: string };

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'in'
  | 'is_empty'
  | 'not_empty';

export type WorkflowCondition = {
  id: string;
  field: string;
  operator: ConditionOperator;
  value?: unknown;
};

export type ApprovalMode = 'sequential' | 'parallel';

export type ApprovalStep = {
  id: string;
  type: 'user' | 'role' | 'manager' | 'group';
  userIds?: string[];
  roles?: string[];
  groupIds?: string[];
  condition?: WorkflowCondition[];
};

export type WorkflowAction =
  | {
      id: string;
      type: 'create_record';
      entity: string;
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      type: 'update_field';
      entity: string;
      field: string;
      value: unknown;
    }
  | {
      id: string;
      type: 'delete_record';
      entity: string;
      recordIdField: string;
    }
  | {
      id: string;
      type: 'send_email';
      to: string[];
      subject: string;
      body: string;
    }
  | {
      id: string;
      type: 'webhook';
      url: string;
      method: 'POST' | 'PUT' | 'PATCH';
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    }
  | {
      id: string;
      type: 'approval';
      mode: ApprovalMode;
      steps: ApprovalStep[];
      expiresInHours?: number;
    };

export type WorkflowDefinition = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  status: WorkflowStatus;
  retryLimit: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  templateKey?: string;
};

export type WorkflowExecutionContext = {
  tenantId: string;
  workflowId: string;
  actorUid?: string;
  record?: Record<string, unknown>;
  previousRecord?: Record<string, unknown>;
  triggerSource: 'manual' | 'schedule' | 'event' | 'test';
};

export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'awaiting_approval';

export type WorkflowRunLog = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
};
