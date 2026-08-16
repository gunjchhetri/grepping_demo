import { Logger } from "@aws-lambda-powertools/logger";
import type {
  DocumentProcessingMessage,
  DocumentProcessingQueueEvent,
} from "../../types/core/queue/document-processor.js";
import { DocumentProcessingService } from "../../services/documents/document-processing-service.js";
import { S3Keys } from "../../utils/s3/s3-keys.js";

export class DocumentProcessor {
  private readonly logger = new Logger({ serviceName: "document-processor" });

  public constructor(private readonly processor: DocumentProcessingService) {}

  public async handle(event: DocumentProcessingQueueEvent): Promise<void> {
    for (const record of event.Records ?? []) {
      await this.extract(record.body);
    }
  }

  private async extract(body: string | undefined): Promise<void> {
    const { userId, documentId } = JSON.parse(body ?? "{}") as DocumentProcessingMessage;

    if (!userId || !documentId) {
      return;
    }

    const key = S3Keys.originalPdf(userId, documentId);
    const processed = await this.processor.process(key);

    if (processed) {
      this.logger.info("Document text extracted", { key });
    }
  }
}
