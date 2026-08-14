import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppConfig } from "../config.js";
import { S3Keys } from "../storage/s3-keys.js";
import type { S3Store } from "../storage/s3-store.js";

const UPLOAD_URL_TTL_SECONDS = 900;
const PDF_CONTENT_TYPE = "application/pdf";

export interface UploadTicket {
  documentId: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

/** Issues presigned uploads and marks finished uploads for asynchronous extraction. */
export class DocumentUploadService {
  private readonly client = new S3Client({});

  public constructor(private readonly store: S3Store) {}

  /** Returns a short-lived URL the browser uses to PUT the PDF straight to S3. */
  public async createUpload(userId: string, contentType: string): Promise<UploadTicket> {
    if (contentType !== PDF_CONTENT_TYPE) {
      throw new Error("Only PDF uploads are supported");
    }

    const documentId = `document-${randomUUID()}`;
    const key = S3Keys.originalPdf(userId, documentId);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: AppConfig.documentsBucket(), Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return { documentId, key, uploadUrl, expiresIn: UPLOAD_URL_TTL_SECONDS };
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
}
