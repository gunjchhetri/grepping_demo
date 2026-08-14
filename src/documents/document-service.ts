import type { DocumentRecord } from "../types.js";
import { EXTRACTED_TEXT, ORIGINAL_PDF, S3Keys } from "../storage/s3-keys.js";
import type { S3Store } from "../storage/s3-store.js";

// The demo does not keep the uploaded file name anywhere, so every document lists
// under the same label. Status is derived purely from which objects exist.
const DISPLAY_NAME = "document.pdf";

/** Lists a user's documents by reading the object layout. There is no database. */
export class DocumentService {
  public constructor(private readonly store: S3Store) {}

  public async list(userId: string): Promise<DocumentRecord[]> {
    const documents = new Map<string, DocumentRecord>();

    for (const object of await this.store.list(S3Keys.userDocuments(userId))) {
      const parts = S3Keys.parseDocumentObject(object.key);

      if (parts?.userId !== userId) {
        continue;
      }

      const record = documents.get(parts.documentId) ?? {
        documentId: parts.documentId,
        fileName: DISPLAY_NAME,
        status: "PROCESSING" as const,
      };

      if (parts.fileName === ORIGINAL_PDF) {
        record.uploadedAt = object.lastModified?.toISOString();
      }

      if (parts.fileName === EXTRACTED_TEXT) {
        record.status = "READY";
      }

      documents.set(parts.documentId, record);
    }

    return [...documents.values()].sort((left, right) => (right.uploadedAt ?? "").localeCompare(left.uploadedAt ?? ""));
  }
}
