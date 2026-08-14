/** A document is PROCESSING until its extracted text object exists, then READY. */
export type DocumentStatus = "PROCESSING" | "READY";

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  uploadedAt?: string;
}
