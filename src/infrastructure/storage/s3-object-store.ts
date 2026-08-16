import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Object } from "../../types/infrastructure/storage/s3-object-store.js";

/** AWS adapter for S3 object persistence. */
export class S3ObjectStore {
  private readonly client = new S3Client({});

  public constructor(private readonly bucket: string) {}

  public async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );

    if (!result.UploadId) {
      throw new Error("S3 did not return a multipart upload id");
    }

    return result.UploadId;
  }

  public async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn },
    );
  }

  public async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { ETag: string; PartNumber: number }[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  public async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  public async putText(key: string, body: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "text/plain; charset=utf-8" }),
    );
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));

      return true;
    } catch (error: unknown) {
      if (this.isMissing(error)) {
        return false;
      }

      throw error;
    }
  }

  public async list(prefix: string): Promise<S3Object[]> {
    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );

      for (const object of page.Contents ?? []) {
        if (object.Key) {
          objects.push({ key: object.Key, lastModified: object.LastModified });
        }
      }

      continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  private isMissing(error: unknown): boolean {
    return error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey");
  }
}
