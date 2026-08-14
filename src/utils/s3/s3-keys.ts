import { UserIdentity } from "../identity/user-identity.js";

/**
 * Every object key is namespaced by the browser's user id, which is the only thing
 * separating one visitor's documents from another's. Building and parsing keys lives
 * here so that layout is stated once.
 */
export class S3Keys {
  /** File names stored inside each document's folder. */
  public static readonly originalPdfFile = "original.pdf";
  public static readonly extractedTextFile = "document.txt";
  private static readonly documents = "documents";
  private static readonly processing = "processing";
  private static readonly requests = "llm-requests";
  private static readonly answers = "llm-responses";
  private static readonly identity = new UserIdentity();

  /** Prefix holding every document owned by one user. */
  public static userDocuments(userId: string): string {
    return `${S3Keys.documents}/${userId}/`;
  }

  public static originalPdf(userId: string, documentId: string): string {
    return `${S3Keys.userDocuments(userId)}${documentId}/${S3Keys.originalPdfFile}`;
  }

  public static extractedText(userId: string, documentId: string): string {
    return `${S3Keys.userDocuments(userId)}${documentId}/${S3Keys.extractedTextFile}`;
  }

  /** Marker object whose creation triggers PDF text extraction. */
  public static processingMarker(userId: string, documentId: string): string {
    return `${S3Keys.processing}/${userId}/${documentId}.json`;
  }

  /** Request object whose creation triggers the LLM worker. */
  public static questionRequest(userId: string, jobId: string): string {
    return `${S3Keys.requests}/${userId}/${jobId}.json`;
  }

  public static questionAnswer(userId: string, jobId: string): string {
    return `${S3Keys.answers}/${userId}/${jobId}.json`;
  }

  public static parseProcessingMarker(key: string): { userId: string; documentId: string } | undefined {
    const [userId, documentId] = S3Keys.segments(key, S3Keys.processing, 2);

    return S3Keys.identity.isValid(userId) && documentId
      ? { userId, documentId: S3Keys.withoutJson(documentId) }
      : undefined;
  }

  public static parseQuestionRequest(key: string): { userId: string; jobId: string } | undefined {
    const [userId, jobId] = S3Keys.segments(key, S3Keys.requests, 2);

    return S3Keys.identity.isValid(userId) && jobId ? { userId, jobId: S3Keys.withoutJson(jobId) } : undefined;
  }

  public static parseDocumentObject(key: string): { userId: string; documentId: string; fileName: string } | undefined {
    const [userId, documentId, fileName] = S3Keys.segments(key, S3Keys.documents, 3);

    return S3Keys.identity.isValid(userId) && documentId && fileName ? { userId, documentId, fileName } : undefined;
  }

  /** S3 event notifications deliver keys URL-encoded with spaces as plus signs. */
  public static decodeEventKey(key: string | undefined): string | undefined {
    return key ? decodeURIComponent(key.replace(/\+/g, " ")) : undefined;
  }

  /** Splits `<prefix>/a/b/...` into its segments, or returns nothing when the shape differs. */
  private static segments(key: string, prefix: string, expected: number): string[] {
    const parts = key.split("/");

    return parts.length === expected + 1 && parts[0] === prefix ? parts.slice(1) : [];
  }

  private static withoutJson(segment: string): string {
    return segment.replace(/\.json$/, "");
  }
}
