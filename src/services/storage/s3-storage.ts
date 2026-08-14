import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AppConstants } from "../../constants/app-constants.js";
import { AbstractFileStorage, type StorageEntry } from "./abstract-file-storage.js";

/** S3 implementation of the generic storage contract. It knows nothing about documents or questions. */
export class S3Storage extends AbstractFileStorage {
  private readonly client = new S3Client({});

  public constructor(private readonly bucket: string) {
    super();
  }

  /** Downloads an S3 object as raw bytes. */
  public async getBytes(path: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));

    if (!response.Body) {
      throw new Error(`S3 object has no body: s3://${this.bucket}/${path}`);
    }

    return response.Body.transformToByteArray();
  }

  /** Downloads an S3 object and decodes it as text. */
  public async getText(path: string): Promise<string> {
    return Buffer.from(await this.getBytes(path)).toString(AppConstants.textEncoding);
  }

  /** Downloads an S3 object and parses it as JSON. */
  public async getJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.getText(path)) as T;
  }

  /** Uploads text to S3. */
  public async putText(path: string, value: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: path, Body: value, ContentType: AppConstants.textContentType }),
    );
  }

  /** Serializes a value as JSON and uploads it to S3. */
  public async putJson(path: string, value: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: JSON.stringify(value),
        ContentType: AppConstants.jsonContentType,
      }),
    );
  }

  /** Checks whether an S3 object exists. */
  public async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));

      return true;
    } catch (error: unknown) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
        return false;
      }

      throw error;
    }
  }

  /** Reads and parses an S3 object as JSON, or returns undefined when it does not exist. */
  public async getJsonIfPresent<T>(path: string): Promise<T | undefined> {
    return (await this.exists(path)) ? this.getJson<T>(path) : undefined;
  }

  /** Lists S3 objects under a prefix, including paginated results. */
  public async list(prefix: string): Promise<StorageEntry[]> {
    const objects: StorageEntry[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );

      objects.push(
        ...(result.Contents ?? [])
          .filter((object): object is { Key: string; LastModified?: Date } => Boolean(object.Key))
          .map((object) => ({ path: object.Key, lastModified: object.LastModified })),
      );
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }
}
