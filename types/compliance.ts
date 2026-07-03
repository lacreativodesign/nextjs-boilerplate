export type RetentionAction = 'delete' | 'archive';

export type ComplianceEntityType =
  | 'audit_logs'
  | 'invoices'
  | 'expenses'
  | 'projects'
  | 'tasks'
  | 'documents'
  | 'users'
  | 'notifications'
  | 'custom';

export type ComplianceReportType = 'summary' | 'gdpr' | 'retention' | 'audit';

export type ComplianceReportStatus = 'pending' | 'completed' | 'failed';

export type RequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DataRetentionPolicy {
  id: string;
  tenantId: string;
  entityType: ComplianceEntityType;
  collectionPath: string;
  retentionDays: number;
  action: RetentionAction;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReport {
  id: string;
  tenantId: string;
  type: ComplianceReportType;
  periodStart: string;
  periodEnd: string;
  status: ComplianceReportStatus;
  generatedBy: string;
  metrics: Record<string, number>;
  details?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DataExportRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  subjectUserId: string;
  format: 'json' | 'csv';
  status: RequestStatus;
  requestedAt: string;
  completedAt?: string;
  filePath?: string;
  error?: string;
}

export interface DataDeletionRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  subjectUserId: string;
  mode: 'anonymize' | 'delete';
  status: RequestStatus;
  requestedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ConsentRecord {
  id: string;
  tenantId: string;
  userId: string;
  consentType: 'terms' | 'privacy' | 'marketing' | 'data_processing';
  granted: boolean;
  version: string;
  source: 'web' | 'mobile' | 'api' | 'admin';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
