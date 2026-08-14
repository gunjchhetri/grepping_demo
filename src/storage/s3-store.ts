import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface S3Object {
  key: string;
  lastModified?: Date;
}

/** Thin S3 wrapper. It knows about objects, never about documents or questions. */
export class S3Store {
  private readonly client = new S3Client({});

  public constructor(private readonly bucket: string) {}

  public async putText(key: string, value: string): Promise<void> {
    await this.put(key, value, "text/plain; charset=utf-8");
  }

  public async putJson(key: string, value: unknown): Promise<void> {
    await this.put(key, JSON.stringify(value), "application/json");
  }

  /** Reads and parses a JSON object, or returns undefined when the key does not exist. */
  public async readJson<T>(key: string): Promise<T | undefined> {
    const response = await this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch((error: unknown) => {
        if (isMissing(error)) {
          return undefined;
        }

        throw error;
      });

    return response?.Body ? (JSON.parse(await response.Body.transformToString()) as T) : undefined;
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));

      return true;
    } catch (error: unknown) {
      if (isMissing(error)) {
        return false;
      }

      throw error;
    }
  }

  /** Lists every object under a prefix, following pagination. */
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

  private async put(key: string, body: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey");
}
