export type LlmProviderName = "openai" | "anthropic" | "bedrock";

/** A document is PROCESSING until its extracted text object exists, then READY. */
export type DocumentStatus = "PROCESSING" | "READY";

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  uploadedAt?: string;
}

/** Search terms the model derives from a question, grouped by how strongly each one counts. */
export interface QueryTerms {
  exactTerms: string[];
  keywords: string[];
  technicalTerms: string[];
  phrases: string[];
}

/** One line of the document that ripgrep matched. */
export interface LineMatch {
  lineNumber: number;
  matchedTerms: string[];
}

/** A slice of a document built to answer one question. Passages are never persisted. */
export interface Passage {
  id: string;
  pageNumbers: number[];
  text: string;
}

/** A passage carrying the lexical score used to rank it against its siblings. */
export interface ScoredPassage extends Passage {
  score: number;
}

/** A question queued for the model, written to S3 so the worker can pick it up. */
export interface QuestionRequest {
  jobId: string;
  userId: string;
  documentId: string;
  question: string;
  passages: Passage[];
  createdAt: string;
}

/** The worker's answer, written to S3 for the browser to poll. */
export interface QuestionAnswer {
  jobId: string;
  status: "COMPLETED";
  answer: string;
  sources: Passage[];
  completedAt: string;
}
