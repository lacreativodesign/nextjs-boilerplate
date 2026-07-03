export type ImportEntity =
  | 'clients'
  | 'invoices'
  | 'products'
  | 'employees'
  | 'projects'
  | 'tasks'
  | 'time_entries';

export type ImportJobStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type ExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ImportFileFormat = 'csv' | 'excel_xml';

export interface ImportFieldMapping {
  sourceColumn: string;
  destinationField: string;
  required?: boolean;
  transform?: 'string' | 'number' | 'boolean' | 'date';
}

export interface ImportTemplate {
  id: string;
  tenantId: string;
  entity: ImportEntity;
  name: string;
  mappings: ImportFieldMapping[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRowError {
  row: number;
  field?: string;
  code: 'MISSING_REQUIRED' | 'INVALID_TYPE' | 'VALIDATION' | 'DUPLICATE' | 'SYSTEM';
  message: string;
  value?: unknown;
}

export interface ImportJob {
  id: string;
  tenantId: string;
  entity: ImportEntity;
  fileName: string;
  format: ImportFileFormat;
  storagePath: string;
  status: ImportJobStatus;
  progress: number;
  totalRows: number;
  processedRows: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  mappings: ImportFieldMapping[];
  errors: ImportRowError[];
  templateId?: string | null;
  summary?: {
    inserted: number;
    failed: number;
    duplicates: number;
  };
}

export interface ExportFieldSelection {
  sourceField: string;
  label: string;
}

export interface ExportFilter {
  field: string;
  operator: 'eq';
  value: string | number | boolean;
}

export interface ExportConfiguration {
  fields: ExportFieldSelection[];
  filters?: ExportFilter[];
  format: 'csv' | 'excel';
  scope: 'all' | 'current_page';
  pageSize?: number;
  pageCursor?: string;
}

export interface ExportJob {
  id: string;
  tenantId: string;
  entity: ImportEntity;
  status: ExportJobStatus;
  format: 'csv' | 'excel';
  fileName: string;
  storagePath?: string;
  signedUrl?: string;
  totalRows: number;
  processedRows: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fields: ExportFieldSelection[];
  filters: ExportFilter[];
}
