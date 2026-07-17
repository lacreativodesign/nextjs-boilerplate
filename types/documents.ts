export type DocumentCategory =
  | 'invoice'
  | 'receipt'
  | 'contract'
  | 'proposal'
  | 'report'
  | 'statement'
  | 'tax_document'
  | 'legal'
  | 'hr'
  | 'marketing'
  | 'other';

export type DocumentVisibility = 'private' | 'team' | 'public';

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';

export type VirusScanStatus = 'pending' | 'clean' | 'unscanned' | 'infected' | 'failed';

export interface Document {
  id: string;
  tenantId: string;

  // File details
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  fileExtension: string;

  // Storage
  storageProvider: 'firebase' | 'aws_s3' | 'gcp';
  storagePath: string;
  storageUrl: string;
  publicUrl?: string;

  // Metadata
  title?: string;
  description?: string;
  tags: string[];
  category: DocumentCategory;

  // Organization
  folderId?: string;
  folderPath?: string;

  // Relationships
  relatedResourceType?: string;
  relatedResourceId?: string;

  // Version control
  version: number;
  isLatestVersion: boolean;
  previousVersionId?: string;

  // Access control
  uploadedBy: string;
  uploadedByEmail: string;
  visibility: DocumentVisibility;
  sharedWith?: string[];
  allowedRoles?: string[];

  // Processing
  status: DocumentStatus;
  processingError?: string;
  thumbnailUrl?: string;
  previewUrl?: string;

  // Security
  isEncrypted: boolean;
  checksum?: string;
  virusScanStatus?: VirusScanStatus;

  // Usage
  downloadCount: number;
  lastAccessedAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;

  // Timestamps
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  deletedAt?: FirebaseFirestore.Timestamp | null;
}

export interface Folder {
  id: string;
  tenantId: string;

  // Folder details
  name: string;
  description?: string;
  color?: string;
  icon?: string;

  // Hierarchy
  parentId?: string;
  path: string;
  level: number;

  // Access control
  createdBy: string;
  visibility: DocumentVisibility;
  sharedWith?: string[];
  allowedRoles?: string[];

  // Stats
  documentCount: number;
  totalSize: number;

  // Timestamps
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface DocumentShare {
  id: string;
  tenantId: string;
  documentId: string;

  // Share details
  shareType: 'user' | 'public_link';
  sharedWith?: string;
  publicToken?: string;

  // Permissions
  permissions: {
    canView: boolean;
    canDownload: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };

  // Expiration
  expiresAt?: FirebaseFirestore.Timestamp;
  isRevoked: boolean;

  // Tracking
  createdBy: string;
  accessCount: number;
  lastAccessedAt?: FirebaseFirestore.Timestamp;

  // Timestamps
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
