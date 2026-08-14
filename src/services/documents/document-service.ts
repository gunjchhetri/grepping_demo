import { randomUUID } from "node:crypto";
import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { S3Store } from "../storage/s3-store.js";
import type { DocumentRecord } from "../../types/document.js";

export interface UploadTicket {
  documentId: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

/**
 * The document domain: issue presigned uploads, mark finished uploads for extraction,
 * and list what a user has. Every document is a folder of S3 objects — there is no
 * database, so status and listings are derived purely from which objects exist.
 */
export class DocumentService {
  private static readonly uploadUrlTtlSeconds = 900;
  private static readonly pdfContentType = "application/pdf";
  // The demo does not keep the uploaded file name anywhere, so every document lists
  // under the same label.
  private static readonly displayName = "document.pdf";

  public constructor(private readonly store: S3Store) {}

  /** Returns a short-lived URL the browser uses to PUT the PDF straight to S3. */
  public async createUpload(userId: string, contentType: string): Promise<UploadTicket> {
    if (contentType !== DocumentService.pdfContentType) {
      throw new Error("Only PDF uploads are supported");
    }

    const documentId = `document-${randomUUID()}`;
    const key = S3Keys.originalPdf(userId, documentId);
    const uploadUrl = await this.store.presignPut(key, contentType, DocumentService.uploadUrlTtlSeconds);

    return { documentId, key, uploadUrl, expiresIn: DocumentService.uploadUrlTtlSeconds };
  }

  /**
   * Confirms the upload landed and writes the marker that triggers extraction.
   * The key is rebuilt from the caller's own user id, so one visitor cannot start
   * processing inside another visitor's namespace.
   */
  public async startProcessing(userId: string, documentId: string, key: string): Promise<void> {
    if (key !== S3Keys.originalPdf(userId, documentId)) {
      throw new Error("Uploaded document key is invalid");
    }

    if (!(await this.store.exists(key))) {
      throw new Error("Uploaded document was not found");
    }

    await this.store.putJson(S3Keys.processingMarker(userId, documentId), {
      userId,
      documentId,
      sourceKey: key,
      createdAt: new Date().toISOString(),
    });
  }

  /** Lists a user's documents, deriving status from which objects each folder holds. */
  public async list(userId: string): Promise<DocumentRecord[]> {
    const documents = new Map<string, DocumentRecord>();

    for (const object of await this.store.list(S3Keys.userDocuments(userId))) {
      const parts = S3Keys.parseDocumentObject(object.key);

      if (parts?.userId !== userId) {
        continue;
      }

      const record = documents.get(parts.documentId) ?? {
        documentId: parts.documentId,
        fileName: DocumentService.displayName,
        status: "PROCESSING" as const,
      };

      if (parts.fileName === S3Keys.originalPdfFile) {
        record.uploadedAt = object.lastModified?.toISOString();
      }

      if (parts.fileName === S3Keys.extractedTextFile) {
        record.status = "READY";
      }

      documents.set(parts.documentId, record);
    }

    return [...documents.values()].sort((left, right) => (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? ""));
  }
}
