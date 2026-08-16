import { UserIdentity } from "../identity/user-identity.js";

/** Centralizes the S3 object-key contract used by the services and processors. */
export class S3Keys {
  public static readonly originalPdfFile = "original.pdf";
  public static readonly extractedTextFile = "document.txt";
  private static readonly documentsPrefix = "documents";
  private static readonly identity = new UserIdentity();

  public static userDocuments(userId: string): string {
    return `${S3Keys.documentsPrefix}/${userId}/`;
  }

  public static originalPdf(userId: string, documentId: string): string {
    return `${S3Keys.userDocuments(userId)}${documentId}/${S3Keys.originalPdfFile}`;
  }

  public static extractedText(userId: string, documentId: string): string {
    return `${S3Keys.userDocuments(userId)}${documentId}/${S3Keys.extractedTextFile}`;
  }

  public static parseDocumentObject(key: string): { userId: string; documentId: string; fileName: string } | undefined {
    const [userId, documentId, fileName] = S3Keys.segments(key, S3Keys.documentsPrefix, 3);

    return S3Keys.identity.isValid(userId) && documentId && fileName ? { userId, documentId, fileName } : undefined;
  }

  public static extractedTextForPdf(key: string): string | undefined {
    const parts = S3Keys.parseDocumentObject(key);

    if (!parts || !parts.fileName.toLowerCase().endsWith(".pdf")) {
      return undefined;
    }

    const textFileName =
      parts.fileName.toLowerCase() === S3Keys.originalPdfFile
        ? S3Keys.extractedTextFile
        : parts.fileName.replace(/\.pdf$/i, ".txt");

    return `${S3Keys.userDocuments(parts.userId)}${parts.documentId}/${textFileName}`;
  }

  private static segments(key: string, prefix: string, expected: number): string[] {
    const prefixParts = prefix.split("/");
    const parts = key.split("/");

    return parts.length === prefixParts.length + expected && parts.slice(0, prefixParts.length).join("/") === prefix
      ? parts.slice(prefixParts.length)
      : [];
  }
}
