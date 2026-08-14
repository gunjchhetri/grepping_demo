import { Logger } from "@aws-lambda-powertools/logger";
import { MountedFileStorage } from "../../services/storage/mounted-file-storage.js";
import { S3Storage } from "../../services/storage/s3-storage.js";
import { PdfTextService } from "../../services/text/pdf-text-service.js";
import { AppConfig } from "../../utils/app-config.js";
import { S3KeyBuilder } from "../../utils/core-utils.js";

type S3ObjectCreatedEvent = {
  detail?: {
    object?: {
      key?: string;
    };
  };
};

type ProcessingMarker = {
  userId?: string;
  documentId?: string;
  sourceKey?: string;
};

export class DocumentHandler {
  private readonly storage = new MountedFileStorage();
  private readonly markerStorage = new S3Storage(AppConfig.documentsBucket());
  private readonly pdf = new PdfTextService();
  private readonly keys = new S3KeyBuilder();
  private readonly logger = new Logger({ serviceName: "document-processor" });

  /** Processes uploaded PDFs and stores their extracted text in S3. */
  public async handle(event: S3ObjectCreatedEvent): Promise<void> {
    const encodedKey = event.detail?.object?.key;

    if (!encodedKey) {
      return;
    }

    const key = decodeURIComponent(encodedKey.replace(/\+/g, " "));
    const parts = this.keys.parseProcessingKey(key);

    if (!parts) {
      return;
    }

    const { userId, documentId } = parts;
    const marker = await this.markerStorage.getJson<ProcessingMarker>(key);
    const sourceKey = marker.sourceKey;

    if (marker.documentId !== documentId || sourceKey !== this.keys.originalDocumentKey(userId, documentId)) {
      throw new Error("Invalid document processing marker");
    }

    const extractedKey = this.keys.extractedDocumentKey(userId, documentId);

    if (await this.storage.exists(extractedKey)) {
      return;
    }

    this.logger.appendKeys({ documentId, userId });

    const text = await this.pdf.extract(await this.storage.getBytes(sourceKey));

    await this.markerStorage.putText(extractedKey, text);
    this.logger.info("Document text extracted", { key: sourceKey });
    this.logger.resetKeys();
  }
}
