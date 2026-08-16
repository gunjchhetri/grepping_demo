import { AppConfig } from "../../config/app-config.js";
import { DocumentProcessor } from "../../core/queue/document-processor.js";
import { MountedDocumentStore } from "../../infrastructure/filesystem/mounted-document-store.js";
import { S3ObjectStore } from "../../infrastructure/storage/s3-object-store.js";
import { DocumentProcessingService } from "../../services/documents/document-processing-service.js";
import { LineGroupedPdfTextExtractor } from "../../services/documents/line-grouped-pdf-text-extractor.js";
import type { DocumentProcessingQueueEvent } from "../../types/core/queue/document-processor.js";

const config = new AppConfig();
const documentProcessor = new DocumentProcessor(
  new DocumentProcessingService(
    new MountedDocumentStore(config.documentsMountPath),
    new S3ObjectStore(config.documentsBucket),
    new LineGroupedPdfTextExtractor(),
  ),
);

export const handler = (event: DocumentProcessingQueueEvent) => documentProcessor.handle(event);
