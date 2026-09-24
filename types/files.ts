import type { DocumentVisibility } from '@/types/documents';

export type FileSharePermission = 'view' | 'download' | 'edit';

export interface FilePermissions {
  visibility: DocumentVisibility;
  allowedRoles: string[];
  allowedUsers: string[];
}

export interface ManagedFile {
  id: string;
  tenantId: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  extension: string;
  folderId?: string;
  latestVersion: number;
  latestVersionId: string;
  uploadedBy: string;
  uploadedByEmail: string;
  tags: string[];
  /** LEGACY (P0-07): once a 2-day signed URL. New writes store null; readers strip it. */
  previewUrl?: string | null;
  checksum: string;
  storagePath: string;
  permissions: FilePermissions;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  deletedAt?: FirebaseFirestore.Timestamp | null;
}

export interface FileVersion {
  id: string;
  tenantId: string;
  fileId: string;
  versionNumber: number;
  storagePath: string;
  size: number;
  mimeType: string;
  checksum: string;
  uploadedBy: string;
  uploadedByEmail: string;
  changes?: string;
  /** LEGACY (P0-07): once a 2-day signed URL. New writes store null; readers strip it. */
  previewUrl?: string | null;
  isCurrent: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface ManagedFolder {
  id: string;
  tenantId: string;
  name: string;
  parentFolderId?: string;
  path: string;
  permissions: FilePermissions;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FileShare {
  id: string;
  tenantId: string;
  fileId: string;
  shareToken: string;
  expiresAt?: FirebaseFirestore.Timestamp;
  passwordHash?: string;
  permissions: FileSharePermission[];
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  revokedAt?: FirebaseFirestore.Timestamp;
}

export interface FileTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
}
