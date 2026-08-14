import { randomUUID } from "node:crypto";
import { AppConstants } from "../constants/app-constants.js";
import type { ApiResponse, DocumentKeyParts, QuestionKeyParts } from "../types/domain.js";

export class IdGenerator {
  /** Creates a unique identifier with the supplied prefix. */
  public create(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }
}

export class HttpResponse {
  /** Creates a JSON API response with the application's CORS headers. */
  public json<T>(statusCode: number, payload: T): ApiResponse<T> {
    return {
      statusCode,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": AppConstants.apiCorsOrigin,
        "access-control-allow-headers": `content-type,${AppConstants.userIdHeader}`,
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify(payload),
      payload,
    };
  }

  /** Creates a JSON API error response. */
  public error(statusCode: number, message: string): ApiResponse<{ message: string }> {
    return this.json(statusCode, { message });
  }
}

/**
 * Resolves the browser-generated user identifier that namespaces every stored object.
 * The value is a UUID minted in the browser and kept in local storage; it is a namespace,
 * not an authentication claim, so it is validated strictly before it reaches an S3 key.
 */
export class UserIdentity {
  private static readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Reads and validates the user identifier from request headers. */
  public fromHeaders(headers: Record<string, string | undefined> | undefined): string {
    return this.parse(this.headerValue(headers, AppConstants.userIdHeader));
  }

  /** Validates a raw identifier and returns its canonical lowercase form. */
  public parse(value: unknown): string {
    const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";

    if (!UserIdentity.uuidPattern.test(candidate)) {
      throw new Error(`${AppConstants.userIdHeader} must be a UUID`);
    }

    return candidate;
  }

  /** Reports whether a raw identifier is a usable user namespace. */
  public isValid(value: unknown): boolean {
    return typeof value === "string" && UserIdentity.uuidPattern.test(value.trim().toLowerCase());
  }

  private headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
    if (!headers) {
      return undefined;
    }

    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);

    return match?.[1];
  }
}

export class S3KeyBuilder {
  private readonly identity = new UserIdentity();

  /** Builds the S3 prefix holding every document owned by one user. */
  public userDocumentsPrefix(userId: string): string {
    return `${AppConstants.documentsPrefix}/${userId}/`;
  }

  /** Builds the base S3 path for a document. */
  public documentPrefix(userId: string, documentId: string): string {
    return `${this.userDocumentsPrefix(userId)}${documentId}`;
  }

  /** Builds the S3 key for the original PDF. */
  public originalDocumentKey(userId: string, documentId: string): string {
    return `${this.documentPrefix(userId, documentId)}/${AppConstants.originalPdfFileName}`;
  }

  /** Builds the S3 key for extracted document text. */
  public extractedDocumentKey(userId: string, documentId: string): string {
    return `${this.documentPrefix(userId, documentId)}/${AppConstants.extractedFileName}`;
  }

  /** Builds the S3 key for a processing marker. */
  public processingKey(userId: string, documentId: string): string {
    return `${AppConstants.processingPrefix}${userId}/${documentId}${AppConstants.jsonSuffix}`;
  }

  /** Builds the S3 key for a question request. */
  public requestKey(userId: string, jobId: string): string {
    return `${AppConstants.llmRequestPrefix}${userId}/${jobId}${AppConstants.jsonSuffix}`;
  }

  /** Builds the S3 key for a question response. */
  public responseKey(userId: string, jobId: string): string {
    return `${AppConstants.llmResponsePrefix}${userId}/${jobId}${AppConstants.jsonSuffix}`;
  }

  /** Splits a question request key into its user and job identifiers. */
  public parseRequestKey(key: string): QuestionKeyParts | undefined {
    const match = key.match(
      new RegExp(`^${AppConstants.llmRequestPrefix}([^/]+)/([^/]+)\\${AppConstants.jsonSuffix}$`),
    );

    if (!match || !this.identity.isValid(match[1])) {
      return undefined;
    }

    return { userId: match[1], jobId: match[2] };
  }

  /** Splits a processing marker key into its user and document identifiers. */
  public parseProcessingKey(key: string): DocumentKeyParts | undefined {
    const match = key.match(
      new RegExp(`^${AppConstants.processingPrefix}([^/]+)/([^/]+)\\${AppConstants.jsonSuffix}$`),
    );

    if (!match || !this.identity.isValid(match[1])) {
      return undefined;
    }

    return { userId: match[1], documentId: match[2] };
  }

  /** Splits a document object key into its user, document, and file name parts. */
  public parseDocumentKey(key: string): (DocumentKeyParts & { fileName: string }) | undefined {
    const match = key.match(new RegExp(`^${AppConstants.documentsPrefix}/([^/]+)/([^/]+)/([^/]+)$`));

    if (!match || !this.identity.isValid(match[1])) {
      return undefined;
    }

    return { userId: match[1], documentId: match[2], fileName: match[3] };
  }
}

export class Validation {
  /** Validates and returns a non-empty string value. */
  public requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${name} is required`);
    }

    return value.trim();
  }

  /** Parses a JSON string into the requested type. */
  public parseJson<T>(value: string, name: string): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`${name} must be valid JSON`);
    }
  }
}
