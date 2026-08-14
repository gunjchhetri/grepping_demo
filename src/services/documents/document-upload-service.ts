import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppConstants } from "../../constants/app-constants.js";
import { AppConfig } from "../../utils/app-config.js";
import { IdGenerator, S3KeyBuilder } from "../../utils/core-utils.js";

export interface DocumentUploadTicket {
  documentId: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

/** Creates presigned S3 uploads and marks completed uploads for asynchronous processing. */
export class DocumentUploadService {
  private static readonly uploadUrlExpiresIn = 900;
  private readonly client = new S3Client({});
  private readonly bucket = AppConfig.documentsBucket();
  private readonly ids = new IdGenerator();
  private readonly keys = new S3KeyBuilder();

  public async createUpload(userId: string, contentType: string): Promise<DocumentUploadTicket> {
    if (contentType !== "application/pdf") {
      throw new Error("Only PDF uploads are supported");
    }

    const documentId = this.ids.create(AppConstants.documentIdPrefix);
    const key = this.keys.originalDocumentKey(userId, documentId);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: DocumentUploadService.uploadUrlExpiresIn },
    );

    return { documentId, key, uploadUrl, expiresIn: DocumentUploadService.uploadUrlExpiresIn };
  }

  public async startProcessing(userId: string, documentId: string, key: string): Promise<void> {
    const expectedKey = this.keys.originalDocumentKey(userId, documentId);

    if (key !== expectedKey) {
      throw new Error("Uploaded document key is invalid");
    }

    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
        throw new Error("Uploaded document was not found");
      }

      throw error;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.keys.processingKey(userId, documentId),
        Body: JSON.stringify({ userId, documentId, sourceKey: key, createdAt: new Date().toISOString() }),
        ContentType: AppConstants.jsonContentType,
      }),
    );
  }
}
