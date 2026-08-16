export type DocumentStatus = "PROCESSING" | "READY";

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  uploadedAt?: string;
}

export interface UploadTicket {
  documentId: string;
  key: string;
  uploadId: string;
  partSize: number;
  expiresIn: number;
}

export interface UploadPartTicket {
  uploadUrl: string;
  expiresIn: number;
}

export interface CompletedUploadPart {
  ETag: string;
  PartNumber: number;
}
