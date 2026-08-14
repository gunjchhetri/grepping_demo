export type LlmProviderName = "openai" | "anthropic" | "bedrock";

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  uploadedAt?: string;
  pageCount?: number;
  errorMessage?: string;
}

export interface QueryTerms {
  exactTerms: string[];
  keywords: string[];
  technicalTerms: string[];
  phrases: string[];
}

export interface RipgrepMatch {
  lineNumber: number;
  line: string;
  matchedTerms: string[];
}

export interface PassageCandidate {
  id: string;
  documentId: string;
  startLine: number;
  endLine: number;
  pageNumbers: number[];
  text: string;
  matchedTerms: string[];
  lexicalScore: number;
  matchLineNumbers: number[];
}

export interface RetrievalDebug {
  question: string;
  queryTerms: QueryTerms;
  matches: RipgrepMatch[];
  groups: number[][];
  candidates: PassageCandidate[];
  selectedPassages: PassageCandidate[];
}

export interface QuestionRequest {
  jobId: string;
  correlationId: string;
  userId: string;
  documentId: string;
  question: string;
  candidates: PassageCandidate[];
  retrievalDebug: RetrievalDebug;
  createdAt: string;
}

export interface DocumentKeyParts {
  userId: string;
  documentId: string;
}

export interface QuestionKeyParts {
  userId: string;
  jobId: string;
}

export interface ApiResponse<T> {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  payload?: T;
}
