import { existsSync } from "node:fs";
import { join } from "node:path";
import { AppConstants } from "../../constants/app-constants.js";
import type { DocumentRecord } from "../../types/domain.js";
import { AppConfig } from "../../utils/app-config.js";
import { S3KeyBuilder } from "../../utils/core-utils.js";
import { AbstractFileStorage } from "../storage/abstract-file-storage.js";

/** Owns document-specific behavior. Storage is injected so this service is not tied to S3. */
export class DocumentService {
  public constructor(
    private readonly storage: AbstractFileStorage,
    private readonly keys = new S3KeyBuilder(),
  ) {}

  /** Lists one user's documents and derives their processing status from S3 objects. */
  public async list(userId: string): Promise<DocumentRecord[]> {
    const prefix = this.keys.userDocumentsPrefix(userId);
    const objects = await this.storage.list(prefix);
    const documents = new Map<string, DocumentRecord>();

    for (const object of objects) {
      const parts = this.keys.parseDocumentKey(object.path);

      if (!parts || parts.userId !== userId) {
        continue;
      }

      const document = documents.get(parts.documentId) ?? {
        documentId: parts.documentId,
        fileName: AppConstants.documentDisplayName,
        status: "UPLOADING" as const,
      };

      if (parts.fileName === AppConstants.originalPdfFileName) {
        if (document.status === "UPLOADING") {
          document.status = "PROCESSING";
        }

        document.uploadedAt = object.lastModified?.toISOString();
      }

      if (parts.fileName === AppConstants.extractedFileName) {
        document.status = "READY";
      }

      documents.set(parts.documentId, document);
    }

    return [...documents.values()].sort((left, right) => (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? ""));
  }

  /** Returns the mounted path for an extracted document. */
  public async extractedTextPath(userId: string, documentId: string): Promise<string> {
    const key = this.keys.extractedDocumentKey(userId, documentId);
    const mountedPath = join(AppConfig.documentsMountPath(), key);

    if (!existsSync(mountedPath)) {
      throw new Error(`Extracted document is not available: ${key}`);
    }

    return mountedPath;
  }

  /** Builds the S3 key for a document's extracted text. */
  public extractedKey(userId: string, documentId: string): string {
    return this.keys.extractedDocumentKey(userId, documentId);
  }
}
