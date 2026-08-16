import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { MountedDocumentStore } from "../../infrastructure/filesystem/mounted-document-store.js";
import type { S3ObjectStore } from "../../infrastructure/storage/s3-object-store.js";
import type { AbstractPdfTextExtractor } from "../../contracts/services/documents/abstract-pdf-text-extractor.js";

/** Extracts one uploaded PDF and remains idempotent for redelivered queue messages. */
export class DocumentProcessingService {
  public constructor(
    private readonly mountedDocuments: MountedDocumentStore,
    private readonly objects: S3ObjectStore,
    private readonly pdf: AbstractPdfTextExtractor,
  ) {}

  public async process(sourceKey: string): Promise<boolean> {
    const extractedKey = S3Keys.extractedTextForPdf(sourceKey);

    if (!extractedKey) {
      return false;
    }

    if (this.mountedDocuments.exists(extractedKey)) {
      return false;
    }

    const text = await this.pdf.extract(await this.mountedDocuments.readBytes(sourceKey));

    // Written through the S3 API rather than the mount: the access point pins uid/gid 1000, but the
    // per-document directory is materialized by the presigned PUT, so it is not writable by that user.
    await this.objects.putText(extractedKey, text);

    return true;
  }
}
