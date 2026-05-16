import crypto from "crypto";
import { tmpdir } from "os";
import path from "path";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import * as admin from "firebase-admin";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import type { Document, DocumentCategory, DocumentVisibility, VirusScanStatus } from "@/types/documents";

const execFileAsync = promisify(execFile);

export class StorageService {
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
  ];

  /**
   * Upload file to Firebase Storage
   */
  static async uploadFile(params: {
    tenantId: string;
    userId: string;
    userEmail: string;
    file: Buffer;
    fileName: string;
    mimeType: string;
    category: DocumentCategory;
    folderId?: string;
    relatedResourceType?: string;
    relatedResourceId?: string;
    visibility?: DocumentVisibility;
    tags?: string[];
    title?: string;
    description?: string;
  }): Promise<string> {
    this.validateFile(params.file, params.mimeType);

    const fileExtension = this.getExtension(params.fileName);
    const uniqueFileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${fileExtension}`;
    const storagePath = `tenants/${params.tenantId}/documents/${uniqueFileName}`;

    const checksum = crypto.createHash("sha256").update(params.file).digest("hex");
    const virusScanStatus = await this.scanFile(params.file, params.fileName, params.mimeType);

    if (virusScanStatus !== "clean") {
      throw new Error("Virus scan failed or file is infected.");
    }

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    const file = bucket.file(storagePath);

    await file.save(params.file, {
      metadata: {
        contentType: params.mimeType,
        metadata: {
          tenantId: params.tenantId,
          uploadedBy: params.userId,
          checksum,
        },
      },
    });

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    let folderPath: string | undefined;
    if (params.folderId) {
      const folderDoc = await adminDb.collection("folders").doc(params.folderId).get();
      folderPath = folderDoc.data()?.path;
    }

    const now = admin.firestore.Timestamp.now();

    const document: Omit<Document, "id"> = {
      tenantId: params.tenantId,
      fileName: uniqueFileName,
      originalFileName: params.fileName,
      fileSize: params.file.length,
      mimeType: params.mimeType,
      fileExtension: fileExtension.replace(".", ""),
      storageProvider: "firebase",
      storagePath,
      storageUrl: url,
      category: params.category,
      folderId: params.folderId,
      folderPath,
      relatedResourceType: params.relatedResourceType,
      relatedResourceId: params.relatedResourceId,
      uploadedBy: params.userId,
      uploadedByEmail: params.userEmail,
      visibility: params.visibility || "private",
      tags: params.tags || [],
      title: params.title,
      description: params.description,
      version: 1,
      isLatestVersion: true,
      status: "ready",
      isEncrypted: false,
      checksum,
      virusScanStatus,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      previewUrl: this.isPreviewable(params.mimeType) ? url : undefined,
    };

    const docRef = await adminDb.collection("documents").add(document);

    if (params.folderId) {
      await adminDb.collection("folders").doc(params.folderId).update({
        documentCount: admin.firestore.FieldValue.increment(1),
        totalSize: admin.firestore.FieldValue.increment(params.file.length),
        updatedAt: now,
      });
    }

    return docRef.id;
  }

  /**
   * Generate download URL
   */
  static async getDownloadUrl(documentId: string): Promise<string> {
    const doc = await adminDb.collection("documents").doc(documentId).get();

    if (!doc.exists) {
      throw new Error("Document not found");
    }

    const document = doc.data() as Document;
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const file = (bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket()).file(document.storagePath);

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });

    await adminDb.collection("documents").doc(documentId).update({
      downloadCount: admin.firestore.FieldValue.increment(1),
      lastAccessedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return url;
  }

  /**
   * Delete file
   */
  static async deleteFile(documentId: string): Promise<void> {
    const doc = await adminDb.collection("documents").doc(documentId).get();

    if (!doc.exists) {
      throw new Error("Document not found");
    }

    const document = doc.data() as Document;

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const file = (bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket()).file(document.storagePath);
    await file.delete({ ignoreNotFound: true });

    await adminDb.collection("documents").doc(documentId).update({
      deletedAt: admin.firestore.Timestamp.now(),
      status: "deleted",
      isLatestVersion: false,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    if (document.folderId) {
      await adminDb.collection("folders").doc(document.folderId).update({
        documentCount: admin.firestore.FieldValue.increment(-1),
        totalSize: admin.firestore.FieldValue.increment(-document.fileSize),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }
  }

  /**
   * Create new version of document
   */
  static async createVersion(params: {
    tenantId: string;
    userId: string;
    userEmail: string;
    originalDocumentId: string;
    file: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<string> {
    const originalDoc = await adminDb.collection("documents").doc(params.originalDocumentId).get();

    if (!originalDoc.exists) {
      throw new Error("Original document not found");
    }

    const original = originalDoc.data() as Document;

    await adminDb.collection("documents").doc(params.originalDocumentId).update({
      isLatestVersion: false,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    const newDocId = await this.uploadFile({
      tenantId: params.tenantId,
      userId: params.userId,
      userEmail: params.userEmail,
      file: params.file,
      fileName: params.fileName,
      mimeType: params.mimeType,
      category: original.category,
      folderId: original.folderId,
      relatedResourceType: original.relatedResourceType,
      relatedResourceId: original.relatedResourceId,
      visibility: original.visibility,
      tags: original.tags,
      title: original.title,
      description: original.description,
    });

    await adminDb.collection("documents").doc(newDocId).update({
      version: original.version + 1,
      previousVersionId: params.originalDocumentId,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return newDocId;
  }

  private static validateFile(file: Buffer, mimeType: string) {
    if (file.length > this.MAX_FILE_SIZE) {
      throw new Error("File size exceeds maximum allowed size");
    }

    if (!this.ALLOWED_TYPES.includes(mimeType)) {
      throw new Error("File type not allowed");
    }
  }

  private static getExtension(fileName: string): string {
    const parts = fileName.split(".");
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : "";
  }

  private static isPreviewable(mimeType: string) {
    return mimeType.startsWith("image/") || mimeType === "application/pdf";
  }

  private static async scanFile(
    file: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<VirusScanStatus> {
    const endpoint = process.env.DOCUMENT_VIRUS_SCAN_ENDPOINT;
    if (endpoint) {
      return this.scanFileWithEndpoint({ endpoint, file, fileName, mimeType });
    }
    return "clean"; // No scanner configured — skip scan, allow upload
  }

  private static async scanFileWithEndpoint(params: {
    endpoint: string;
    file: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<VirusScanStatus> {
    const apiKey = process.env.DOCUMENT_VIRUS_SCAN_API_KEY;

    const formData = new FormData();
    formData.append("file", new Blob([params.file], { type: params.mimeType }), params.fileName);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(params.endpoint, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      return "failed";
    }

    const result = (await response.json()) as { status?: string; infected?: boolean };
    if (typeof result.infected === "boolean") {
      return result.infected ? "infected" : "clean";
    }
    if (result.status === "clean" || result.status === "infected") {
      return result.status;
    }

    return "failed";
  }

  private static async scanFileWithClamAv(file: Buffer, fileName: string): Promise<VirusScanStatus> {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "doc-scan-"));
    const filePath = path.join(tempDir, fileName);

    try {
      await fs.writeFile(filePath, file);
      await execFileAsync("clamscan", ["--no-summary", filePath]);
      return "clean";
    } catch (error: any) {
      if (error?.code === 1) {
        return "infected";
      }
      return "failed";
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
