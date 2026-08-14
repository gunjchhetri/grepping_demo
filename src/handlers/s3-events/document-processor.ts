import { Logger } from "@aws-lambda-powertools/logger";
import { AppConfig } from "../../config.js";
import { PdfTextService } from "../../documents/pdf-text-service.js";
import { MountedDocuments } from "../../storage/mounted-documents.js";
import { S3Keys } from "../../storage/s3-keys.js";
import { S3Store } from "../../storage/s3-store.js";

export interface ObjectCreatedEvent {
  detail?: { object?: { key?: string } };
}

interface ProcessingMarker {
  documentId?: string;
  sourceKey?: string;
}

/**
 * Triggered by a processing marker landing in S3. Reads the PDF through the mount
 * and writes its page-marked text back beside the original.
 */
export class DocumentProcessor {
  private readonly documents = new S3Store(AppConfig.documentsBucket());
  private readonly mount = new MountedDocuments();
  private readonly pdf = new PdfTextService();
  private readonly logger = new Logger({ serviceName: "document-processor" });

  public async handle(event: ObjectCreatedEvent): Promise<void> {
    const key = decodeKey(event.detail?.object?.key);
    const parts = key ? S3Keys.parseProcessingMarker(key) : undefined;

    if (!key || !parts) {
      return;
    }

    const { userId, documentId } = parts;
    const marker = await this.documents.readJson<ProcessingMarker>(key);
    const sourceKey = S3Keys.originalPdf(userId, documentId);

    if (marker?.documentId !== documentId || marker.sourceKey !== sourceKey) {
      throw new Error("Invalid document processing marker");
    }

    const extractedKey = S3Keys.extractedText(userId, documentId);

    if (this.mount.exists(extractedKey)) {
      return;
    }

    this.logger.appendKeys({ documentId, userId });

    const text = await this.pdf.extract(await this.mount.readBytes(sourceKey));

    await this.documents.putText(extractedKey, text);
    this.logger.info("Document text extracted");
    this.logger.resetKeys();
  }
}

/** S3 event keys arrive URL-encoded with spaces as plus signs. */
function decodeKey(key: string | undefined): string | undefined {
  return key ? decodeURIComponent(key.replace(/\+/g, " ")) : undefined;
}
