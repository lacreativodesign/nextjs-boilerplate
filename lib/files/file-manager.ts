import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { isTenantOwned } from '@/lib/tenant/ownership';
import { validateAssembledFile, MAX_FILE_SIZE } from '@/lib/files/validation';
import { checkStorageLimit, storageLimitResponseBody } from '@/lib/billing/storage-limit';
import type {
  ManagedFile,
  FileVersion,
  ManagedFolder,
  FileShare,
  FileTag,
  FilePermissions,
  FileSharePermission,
} from '@/types/files';

const FILES_COLLECTION = 'erp_files';
const FILE_VERSIONS_COLLECTION = 'erp_file_versions';
const FOLDERS_COLLECTION = 'erp_folders';
const FILE_SHARES_COLLECTION = 'erp_file_shares';
const FILE_TAGS_COLLECTION = 'erp_file_tags';
const CHUNK_UPLOAD_COLLECTION = 'erp_file_upload_sessions';

const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = 2048;
/** Hard ceiling on assembled bytes, independent of the declared size. */
const MAX_ASSEMBLED_BYTES = MAX_FILE_SIZE;
const CHUNK_TEMP_DIR = 'erp-file-chunks';
const CHUNK_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const SAFE_UPLOAD_ID = /^[A-Za-z0-9_-]{8,128}$/;

type ChunkSession = {
  tenantId: string;
  totalChunks: number;
  receivedChunks: number[];
  fileName: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  changes: string | null;
  fileId: string | null;
  userId: string;
  userEmail: string;
  permissions: FilePermissions;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  /** Optional: sessions created before P0-2 carry no expiry. */
  expiresAt?: admin.firestore.Timestamp;
};

/**
 * A rejection the caller caused. The upload route maps this to a 4xx; anything else
 * remains a 500 so real server faults are not disguised as client errors.
 */
export class UploadRejected extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'UploadRejected';
    this.status = status;
  }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function extensionFromName(name: string) {
  const ext = path.extname(name).replace('.', '').toLowerCase();
  return ext || 'bin';
}

function previewableType(mimeType: string) {
  return (
    mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('video/')
  );
}

function buildPermissions(input?: Partial<FilePermissions>): FilePermissions {
  return {
    visibility: input?.visibility ?? 'private',
    allowedRoles: input?.allowedRoles ?? [],
    allowedUsers: input?.allowedUsers ?? [],
  };
}

export class FileManager {
  static async createFolder(params: {
    tenantId: string;
    name: string;
    parentFolderId?: string;
    createdBy: string;
    permissions?: Partial<FilePermissions>;
  }) {
    let parentPath = '';

    if (params.parentFolderId) {
      const parent = await adminDb.collection(FOLDERS_COLLECTION).doc(params.parentFolderId).get();
      if (!parent.exists) {
        throw new Error('Parent folder not found');
      }
      const parentData = parent.data() as ManagedFolder;
      if (parentData.tenantId !== params.tenantId) {
        throw new Error('Forbidden');
      }
      parentPath = parentData.path;
    }

    const now = admin.firestore.Timestamp.now();
    const folder: Omit<ManagedFolder, 'id'> = {
      tenantId: params.tenantId,
      name: params.name,
      parentFolderId: params.parentFolderId,
      path: `${parentPath}/${params.name}`.replace(/^\//, ''),
      permissions: buildPermissions(params.permissions),
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection(FOLDERS_COLLECTION).add(folder);
    return { id: ref.id, ...folder };
  }

  static async listFiles(params: {
    tenantId: string;
    folderId?: string;
    tag?: string;
    q?: string;
    limit?: number;
  }) {
    let query: FirebaseFirestore.Query = adminDb
      .collection(FILES_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(params.limit ?? 100);

    if (params.folderId) {
      query = query.where('folderId', '==', params.folderId);
    }

    const snapshot = await query.get();
    let files = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as ManagedFile[];

    if (params.tag) {
      files = files.filter((file) => file.tags.includes(params.tag as string));
    }

    if (params.q) {
      const q = params.q.toLowerCase();
      files = files.filter(
        (file) => file.name.toLowerCase().includes(q) || file.path.toLowerCase().includes(q),
      );
    }

    return files;
  }

  static async getFileById(fileId: string, tenantId: string) {
    const snapshot = await adminDb.collection(FILES_COLLECTION).doc(fileId).get();
    if (!snapshot.exists) return null;
    const file = { id: snapshot.id, ...snapshot.data() } as ManagedFile;
    if (file.tenantId !== tenantId || file.deletedAt) return null;
    return file;
  }

  static async generateDownloadUrl(storagePath: string) {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    const file = bucket.file(storagePath);
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 10 });
    return url;
  }

  static async initOrAppendChunk(params: {
    tenantId: string;
    uploadId: string;
    chunkIndex: number;
    totalChunks: number;
    chunk: Buffer;
    fileName: string;
    mimeType: string;
    size: number;
    userId: string;
    userEmail: string;
    folderId?: string;
    changes?: string;
    fileId?: string;
    permissions?: Partial<FilePermissions>;
  }) {
    if (params.chunk.length > MAX_CHUNK_SIZE) {
      throw new UploadRejected('Chunk too large');
    }
    if (params.chunkIndex >= params.totalChunks) {
      throw new UploadRejected('chunkIndex is outside the declared chunk range');
    }
    if (params.totalChunks > MAX_TOTAL_CHUNKS) {
      throw new UploadRejected('Too many chunks');
    }
    if (params.size > MAX_FILE_SIZE) {
      throw new UploadRejected('Declared file size exceeds the maximum upload size');
    }
    if (params.totalChunks * MAX_CHUNK_SIZE > MAX_ASSEMBLED_BYTES) {
      throw new UploadRejected('Declared upload exceeds the maximum assembled size');
    }

    // SEC-004: uploadId becomes a filesystem path segment. Reject anything that is not an
    // opaque token, then prove the resolved directory is still under the approved root.
    if (!SAFE_UPLOAD_ID.test(params.uploadId)) {
      throw new UploadRejected('Invalid upload id');
    }
    const tempRoot = path.resolve(os.tmpdir(), CHUNK_TEMP_DIR);
    const tempDir = path.resolve(tempRoot, params.uploadId);
    if (
      tempDir !== path.join(tempRoot, params.uploadId) ||
      !tempDir.startsWith(tempRoot + path.sep)
    ) {
      throw new UploadRejected('Invalid upload id');
    }

    const nowMs = Date.now();
    const now = admin.firestore.Timestamp.now();
    const sessionRef = adminDb.collection(CHUNK_UPLOAD_COLLECTION).doc(params.uploadId);

    // The session is claimed atomically so two concurrent chunks cannot both initialise it,
    // and so metadata declared on the first chunk cannot be changed by a later one.
    const session = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);

      if (!snap.exists) {
        const created = {
          tenantId: params.tenantId,
          totalChunks: params.totalChunks,
          receivedChunks: [params.chunkIndex],
          fileName: params.fileName,
          mimeType: params.mimeType,
          size: params.size,
          folderId: params.folderId ?? null,
          changes: params.changes ?? null,
          fileId: params.fileId ?? null,
          userId: params.userId,
          userEmail: params.userEmail,
          permissions: buildPermissions(params.permissions),
          createdAt: now,
          updatedAt: now,
          expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + CHUNK_SESSION_TTL_MS),
        };
        tx.set(sessionRef, created);
        return created as ChunkSession;
      }

      const data = snap.data() as ChunkSession;

      // An expired session is never resumed: it is a new upload that happens to reuse an id.
      const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
      if (expiresAtMs && expiresAtMs < nowMs) {
        throw new UploadRejected('Upload session has expired. Start the upload again.');
      }

      // Ownership: tenant AND the user who opened the session.
      if (data.tenantId !== params.tenantId || data.userId !== params.userId) {
        throw new UploadRejected('Upload session not found');
      }

      // Metadata is immutable for the life of the session. Without this a caller declares a
      // small file on chunk 0 and a different file on chunk 1.
      if (
        data.totalChunks !== params.totalChunks ||
        data.fileName !== params.fileName ||
        data.mimeType !== params.mimeType ||
        data.size !== params.size ||
        (data.fileId ?? null) !== (params.fileId ?? null) ||
        (data.folderId ?? null) !== (params.folderId ?? null)
      ) {
        throw new UploadRejected('Upload session metadata does not match the original request');
      }

      const receivedChunks = Array.from(
        new Set<number>([...(data.receivedChunks || []), params.chunkIndex]),
      );
      tx.update(sessionRef, { receivedChunks, updatedAt: now });
      return { ...data, receivedChunks } as ChunkSession;
    });

    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, `${params.chunkIndex}.part`), params.chunk);

    const received = new Set<number>(session.receivedChunks || []);
    const completed = received.size === session.totalChunks;

    if (!completed) {
      return { completed: false as const };
    }

    try {
      const assembledPath = path.join(tempDir, 'assembled.bin');
      const assembledHandle = await fs.open(assembledPath, 'w');
      let assembledBytes = 0;

      try {
        for (let index = 0; index < session.totalChunks; index += 1) {
          const partPath = path.join(tempDir, `${index}.part`);
          const part = await fs.readFile(partPath).catch(() => null);
          if (!part) {
            throw new UploadRejected(`Chunk ${index} is missing. Start the upload again.`);
          }
          assembledBytes += part.length;
          if (assembledBytes > MAX_ASSEMBLED_BYTES) {
            throw new UploadRejected('Assembled upload exceeds the maximum size');
          }
          await assembledHandle.write(part);
        }
      } finally {
        await assembledHandle.close();
      }

      const buffer = await fs.readFile(assembledPath);

      // SEC-004/SEC-006: the only checks that see what was ACTUALLY uploaded — real byte
      // length against the ceiling and the declared size, and magic bytes against the
      // claimed extension.
      const assembledCheck = validateAssembledFile(buffer, session.fileName, session.size);
      if (!assembledCheck.valid) {
        throw new UploadRejected(assembledCheck.error || 'Uploaded file failed validation');
      }

      // Quota is charged on real bytes, after assembly, never on the declared size.
      const quota = await checkStorageLimit(params.tenantId, buffer.length);
      if (!quota.ok) {
        throw new UploadRejected(storageLimitResponseBody(quota).message, 403);
      }

      const result = await this.storeVersion({
        tenantId: params.tenantId,
        userId: session.userId,
        userEmail: session.userEmail,
        fileName: session.fileName,
        mimeType: session.mimeType,
        size: buffer.length,
        folderId: session.folderId ?? undefined,
        changes: session.changes ?? undefined,
        fileId: session.fileId ?? undefined,
        fileBuffer: buffer,
        permissions: session.permissions,
      });

      return { completed: true as const, ...result };
    } finally {
      // Temp bytes and the session record are released whether or not the upload succeeded.
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      await sessionRef.delete().catch(() => undefined);
      void FileManager.purgeExpiredUploadSessions();
    }
  }

  /**
   * Lazy cleanup of abandoned chunk sessions and their temp directories. Called
   * opportunistically after a completed upload so no extra cron job is required.
   */
  static async purgeExpiredUploadSessions(limit = 25) {
    try {
      const expired = await adminDb
        .collection(CHUNK_UPLOAD_COLLECTION)
        .where('expiresAt', '<', admin.firestore.Timestamp.now())
        .limit(limit)
        .get();

      const tempRoot = path.resolve(os.tmpdir(), CHUNK_TEMP_DIR);

      await Promise.all(
        expired.docs.map(async (doc) => {
          if (SAFE_UPLOAD_ID.test(doc.id)) {
            const dir = path.resolve(tempRoot, doc.id);
            if (dir.startsWith(tempRoot + path.sep)) {
              await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
            }
          }
          await doc.ref.delete().catch(() => undefined);
        }),
      );
    } catch {
      // Cleanup is best-effort and must never fail a successful upload.
    }
  }

  static async storeVersion(params: {
    tenantId: string;
    userId: string;
    userEmail: string;
    fileName: string;
    mimeType: string;
    size: number;
    folderId?: string;
    changes?: string;
    fileId?: string;
    fileBuffer: Buffer;
    permissions?: Partial<FilePermissions>;
  }) {
    const now = admin.firestore.Timestamp.now();
    const ext = extensionFromName(params.fileName);
    const cleanName = safeName(params.fileName);
    const checksum = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');

    // SEC-003: a caller-supplied fileId may only target a file owned by this tenant.
    // Without this a user who learns another tenant's erp_files id can push a new
    // version and overwrite that record's name/size/storagePath/checksum.
    if (params.fileId) {
      const existing = await adminDb.collection(FILES_COLLECTION).doc(params.fileId).get();
      if (
        existing.exists &&
        !isTenantOwned({
          data: existing.data(),
          callerTenantId: params.tenantId,
          allowSuperAdmin: false,
        })
      ) {
        throw new Error('File not found');
      }
    }

    // Folder ownership must be proven too, otherwise a foreign folderId is written
    // into this tenant's file path/record.
    if (params.folderId) {
      const folder = await adminDb.collection(FOLDERS_COLLECTION).doc(params.folderId).get();
      if (
        !folder.exists ||
        !isTenantOwned({
          data: folder.data(),
          callerTenantId: params.tenantId,
          allowSuperAdmin: false,
        })
      ) {
        throw new Error('Folder not found');
      }
    }

    const fileRoot = params.fileId ?? adminDb.collection(FILES_COLLECTION).doc().id;
    const existingVersions = await adminDb
      .collection(FILE_VERSIONS_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('fileId', '==', fileRoot)
      .orderBy('versionNumber', 'desc')
      .limit(1)
      .get();

    const nextVersion = existingVersions.empty
      ? 1
      : (existingVersions.docs[0].data().versionNumber as number) + 1;
    const versionId = adminDb.collection(FILE_VERSIONS_COLLECTION).doc().id;

    const storagePath = `tenants/${params.tenantId}/files/${fileRoot}/v${nextVersion}-${Date.now()}-${cleanName}`;
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    const storageFile = bucket.file(storagePath);

    await storageFile.save(params.fileBuffer, {
      metadata: {
        contentType: params.mimeType,
        metadata: {
          tenantId: params.tenantId,
          fileId: fileRoot,
          versionNumber: String(nextVersion),
          uploadedBy: params.userId,
        },
      },
    });

    const [signedPreview] = previewableType(params.mimeType)
      ? await storageFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 1000 * 60 * 60 * 24 * 2,
        })
      : [undefined];

    const versionData: Omit<FileVersion, 'id'> = {
      tenantId: params.tenantId,
      fileId: fileRoot,
      versionNumber: nextVersion,
      storagePath,
      size: params.size,
      mimeType: params.mimeType,
      checksum,
      uploadedBy: params.userId,
      uploadedByEmail: params.userEmail,
      changes: params.changes,
      previewUrl: signedPreview,
      isCurrent: true,
      createdAt: now,
    };

    const batch = adminDb.batch();
    const versionRef = adminDb.collection(FILE_VERSIONS_COLLECTION).doc(versionId);
    batch.set(versionRef, versionData);

    const currentVersions = await adminDb
      .collection(FILE_VERSIONS_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('fileId', '==', fileRoot)
      .where('isCurrent', '==', true)
      .get();

    currentVersions.docs.forEach((doc) => batch.update(doc.ref, { isCurrent: false }));

    const fileRef = adminDb.collection(FILES_COLLECTION).doc(fileRoot);
    const fileSnap = await fileRef.get();

    if (fileSnap.exists) {
      const current = fileSnap.data() as ManagedFile;
      batch.update(fileRef, {
        name: params.fileName,
        path: current.folderId ? `${current.folderId}/${params.fileName}` : params.fileName,
        size: params.size,
        mimeType: params.mimeType,
        extension: ext,
        latestVersion: nextVersion,
        latestVersionId: versionId,
        uploadedBy: params.userId,
        uploadedByEmail: params.userEmail,
        previewUrl: signedPreview,
        checksum,
        storagePath,
        updatedAt: now,
        deletedAt: null,
      });
    } else {
      const fileData: Omit<ManagedFile, 'id'> = {
        tenantId: params.tenantId,
        name: params.fileName,
        path: params.folderId ? `${params.folderId}/${params.fileName}` : params.fileName,
        size: params.size,
        mimeType: params.mimeType,
        extension: ext,
        folderId: params.folderId,
        latestVersion: nextVersion,
        latestVersionId: versionId,
        uploadedBy: params.userId,
        uploadedByEmail: params.userEmail,
        tags: [],
        previewUrl: signedPreview,
        checksum,
        storagePath,
        permissions: buildPermissions(params.permissions),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      batch.set(fileRef, fileData);
    }

    await batch.commit();

    return { fileId: fileRoot, versionId, versionNumber: nextVersion };
  }

  static async listVersions(fileId: string, tenantId: string) {
    const snapshot = await adminDb
      .collection(FILE_VERSIONS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('fileId', '==', fileId)
      .orderBy('versionNumber', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FileVersion[];
  }

  static async restoreVersion(params: { tenantId: string; fileId: string; versionId: string }) {
    const versionDoc = await adminDb
      .collection(FILE_VERSIONS_COLLECTION)
      .doc(params.versionId)
      .get();
    if (!versionDoc.exists) throw new Error('Version not found');
    const version = versionDoc.data() as FileVersion;
    if (version.tenantId !== params.tenantId || version.fileId !== params.fileId) {
      throw new Error('Forbidden');
    }

    const fileRef = adminDb.collection(FILES_COLLECTION).doc(params.fileId);

    const currentVersions = await adminDb
      .collection(FILE_VERSIONS_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('fileId', '==', params.fileId)
      .where('isCurrent', '==', true)
      .get();

    const batch = adminDb.batch();
    currentVersions.docs.forEach((doc) => batch.update(doc.ref, { isCurrent: false }));
    batch.update(versionDoc.ref, { isCurrent: true });
    batch.update(fileRef, {
      latestVersion: version.versionNumber,
      latestVersionId: params.versionId,
      storagePath: version.storagePath,
      size: version.size,
      mimeType: version.mimeType,
      checksum: version.checksum,
      previewUrl: version.previewUrl,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    await batch.commit();
  }

  static async createShare(params: {
    tenantId: string;
    fileId: string;
    createdBy: string;
    expiresAt?: Date;
    password?: string;
    permissions: FileSharePermission[];
  }) {
    const token = crypto.randomBytes(32).toString('hex');
    const passwordHash = params.password
      ? crypto.createHash('sha256').update(params.password).digest('hex')
      : undefined;
    const now = admin.firestore.Timestamp.now();
    const shareData: Omit<FileShare, 'id'> = {
      tenantId: params.tenantId,
      fileId: params.fileId,
      shareToken: token,
      expiresAt: params.expiresAt
        ? admin.firestore.Timestamp.fromDate(params.expiresAt)
        : undefined,
      passwordHash,
      permissions: params.permissions,
      createdBy: params.createdBy,
      createdAt: now,
    };

    const ref = await adminDb.collection(FILE_SHARES_COLLECTION).add(shareData);
    return { id: ref.id, shareToken: token };
  }

  static async addTags(params: {
    tenantId: string;
    fileId: string;
    tags: Array<{ name: string; color: string }>;
    createdBy: string;
  }) {
    const now = admin.firestore.Timestamp.now();

    const batch = adminDb.batch();
    for (const tag of params.tags) {
      const normalizedName = tag.name.trim().toLowerCase();
      const existing = await adminDb
        .collection(FILE_TAGS_COLLECTION)
        .where('tenantId', '==', params.tenantId)
        .where('name', '==', normalizedName)
        .limit(1)
        .get();

      if (existing.empty) {
        const tagDoc: Omit<FileTag, 'id'> = {
          tenantId: params.tenantId,
          name: normalizedName,
          color: tag.color,
          createdBy: params.createdBy,
          createdAt: now,
        };
        batch.set(adminDb.collection(FILE_TAGS_COLLECTION).doc(), tagDoc);
      }
    }

    batch.update(adminDb.collection(FILES_COLLECTION).doc(params.fileId), {
      tags: admin.firestore.FieldValue.arrayUnion(
        ...params.tags.map((tag) => tag.name.trim().toLowerCase()),
      ),
      updatedAt: now,
    });

    await batch.commit();
  }

  static async removeTag(params: { tenantId: string; fileId: string; tagName: string }) {
    const file = await this.getFileById(params.fileId, params.tenantId);
    if (!file) throw new Error('File not found');
    const nextTags = file.tags.filter((tag) => tag !== params.tagName.trim().toLowerCase());
    await adminDb.collection(FILES_COLLECTION).doc(params.fileId).update({
      tags: nextTags,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  static async listFolders(tenantId: string, parentFolderId?: string) {
    let query: FirebaseFirestore.Query = adminDb
      .collection(FOLDERS_COLLECTION)
      .where('tenantId', '==', tenantId);
    query = parentFolderId
      ? query.where('parentFolderId', '==', parentFolderId)
      : query.where('parentFolderId', '==', null);
    const snapshot = await query.orderBy('name', 'asc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as ManagedFolder[];
  }

  static async moveFile(params: { tenantId: string; fileId: string; folderId?: string | null }) {
    const file = await this.getFileById(params.fileId, params.tenantId);
    if (!file) throw new Error('File not found');
    await adminDb
      .collection(FILES_COLLECTION)
      .doc(params.fileId)
      .update({
        folderId: params.folderId || null,
        path: params.folderId ? `${params.folderId}/${file.name}` : file.name,
        updatedAt: admin.firestore.Timestamp.now(),
      });
  }

  static async deleteFolder(params: { tenantId: string; folderId: string }) {
    const childFolders = await adminDb
      .collection(FOLDERS_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('parentFolderId', '==', params.folderId)
      .limit(1)
      .get();

    if (!childFolders.empty) {
      throw new Error('Folder contains subfolders');
    }

    const filesInFolder = await adminDb
      .collection(FILES_COLLECTION)
      .where('tenantId', '==', params.tenantId)
      .where('folderId', '==', params.folderId)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    if (!filesInFolder.empty) {
      throw new Error('Folder contains files');
    }

    await adminDb.collection(FOLDERS_COLLECTION).doc(params.folderId).delete();
  }
}
