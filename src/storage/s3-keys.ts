import { isUserId } from "../user-id.js";

/** File names stored inside each document's folder. */
export const ORIGINAL_PDF = "original.pdf";
export const EXTRACTED_TEXT = "document.txt";

const DOCUMENTS = "documents";
const PROCESSING = "processing";
const REQUESTS = "llm-requests";
const ANSWERS = "llm-responses";

/**
 * Every object key is namespaced by the browser's user id, which is the only thing
 * separating one visitor's documents from another's. Building and parsing keys lives
 * here so that layout is stated once.
 */
export class S3Keys {
  /** Prefix holding every document owned by one user. */
  public static userDocuments(userId: string): string {
    return `${DOCUMENTS}/${userId}/`;
  }

  public static originalPdf(userId: string, documentId: string): string {
    return `${DOCUMENTS}/${userId}/${documentId}/${ORIGINAL_PDF}`;
  }

  public static extractedText(userId: string, documentId: string): string {
    return `${DOCUMENTS}/${userId}/${documentId}/${EXTRACTED_TEXT}`;
  }

  /** Marker object whose creation triggers PDF text extraction. */
  public static processingMarker(userId: string, documentId: string): string {
    return `${PROCESSING}/${userId}/${documentId}.json`;
  }

  /** Request object whose creation triggers the LLM worker. */
  public static questionRequest(userId: string, jobId: string): string {
    return `${REQUESTS}/${userId}/${jobId}.json`;
  }

  public static questionAnswer(userId: string, jobId: string): string {
    return `${ANSWERS}/${userId}/${jobId}.json`;
  }

  public static parseProcessingMarker(key: string): { userId: string; documentId: string } | undefined {
    const [userId, documentId] = S3Keys.segments(key, PROCESSING, 2);

    return isUserId(userId) && documentId ? { userId, documentId: documentId.replace(/\.json$/, "") } : undefined;
  }

  public static parseQuestionRequest(key: string): { userId: string; jobId: string } | undefined {
    const [userId, jobId] = S3Keys.segments(key, REQUESTS, 2);

    return isUserId(userId) && jobId ? { userId, jobId: jobId.replace(/\.json$/, "") } : undefined;
  }

  public static parseDocumentObject(key: string): { userId: string; documentId: string; fileName: string } | undefined {
    const [userId, documentId, fileName] = S3Keys.segments(key, DOCUMENTS, 3);

    return isUserId(userId) && documentId && fileName ? { userId, documentId, fileName } : undefined;
  }

  /** Splits `<prefix>/a/b/...` into its segments, or returns nothing when the shape differs. */
  private static segments(key: string, prefix: string, expected: number): string[] {
    const parts = key.split("/");

    return parts.length === expected + 1 && parts[0] === prefix ? parts.slice(1) : [];
  }
}
