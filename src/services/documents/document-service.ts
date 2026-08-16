import { randomUUID } from "node:crypto";
import type {
  CompletedUploadPart,
  DocumentRecord,
  UploadPartTicket,
  UploadTicket,
} from "../../types/services/documents/document-service.js";
import type { S3ObjectStore } from "../../infrastructure/storage/s3-object-store.js";
import { S3Keys } from "../../utils/s3/s3-keys.js";

/** Document business service for uploads, processing initiation, and listing. */
export class DocumentService {
  private static readonly uploadUrlTtlSeconds = 900;
  private static readonly multipartPartSizeBytes = 8 * 1024 * 1024;
  private static readonly pdfContentType = "application/pdf";
  private static readonly displayName = "document.pdf";

  public constructor(private readonly store: S3ObjectStore) {}

  public async createUpload(userId: string, contentType: string): Promise<UploadTicket> {
    if (contentType !== DocumentService.pdfContentType) {
      throw new Error("Only PDF uploads are supported");
    }

    const documentId = `document-${randomUUID()}`;
    const key = S3Keys.originalPdf(userId, documentId);
    const uploadId = await this.store.createMultipartUpload(key, contentType);

    return {
      documentId,
      key,
      uploadId,
      partSize: DocumentService.multipartPartSizeBytes,
      expiresIn: DocumentService.uploadUrlTtlSeconds,
    };
  }

  public async createPartUpload(
    userId: string,
    documentId: string,
    uploadId: string,
    partNumber: number,
  ): Promise<UploadPartTicket> {
    DocumentService.validatePartNumber(partNumber);
    const key = S3Keys.originalPdf(userId, documentId);
    const uploadUrl = await this.store.presignUploadPart(
      key,
      uploadId,
      partNumber,
      DocumentService.uploadUrlTtlSeconds,
    );

    return { uploadUrl, expiresIn: DocumentService.uploadUrlTtlSeconds };
  }

  public async completeUpload(
    userId: string,
    documentId: string,
    uploadId: string,
    parts: CompletedUploadPart[],
  ): Promise<void> {
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error("At least one uploaded part is required");
    }

    const normalizedParts = parts.map((part) => {
      DocumentService.validatePartNumber(part.PartNumber);

      if (typeof part.ETag !== "string" || part.ETag.trim() === "") {
        throw new Error("Each uploaded part must include an ETag");
      }

      return { ETag: part.ETag, PartNumber: part.PartNumber };
    });
    const partNumbers = new Set(normalizedParts.map((part) => part.PartNumber));

    if (partNumbers.size !== normalizedParts.length) {
      throw new Error("Uploaded part numbers must be unique");
    }

    await this.store.completeMultipartUpload(
      S3Keys.originalPdf(userId, documentId),
      uploadId,
      normalizedParts.sort((left, right) => left.PartNumber - right.PartNumber),
    );
  }

  public async abortUpload(userId: string, documentId: string, uploadId: string): Promise<void> {
    await this.store.abortMultipartUpload(S3Keys.originalPdf(userId, documentId), uploadId);
  }

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

      if (parts.fileName === S3Keys.extractedTextFile || parts.fileName.toLowerCase().endsWith(".txt")) {
        record.status = "READY";
      }

      documents.set(parts.documentId, record);
    }

    return [...documents.values()].sort((left, right) => (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? ""));
  }

  private static validatePartNumber(partNumber: number): void {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new Error("partNumber must be an integer between 1 and 10000");
    }
  }
}
