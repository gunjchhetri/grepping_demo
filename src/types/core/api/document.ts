import type { CompletedUploadPart } from "../../services/documents/document-service.js";

export interface DocumentUploadRequest {
  contentType?: string;
}

export interface DocumentUploadPartRequest {
  documentId?: string;
  uploadId?: string;
  partNumber?: number;
}

export interface DocumentCompleteUploadRequest {
  documentId?: string;
  uploadId?: string;
  parts?: CompletedUploadPart[];
}
