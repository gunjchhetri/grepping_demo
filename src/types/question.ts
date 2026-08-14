import type { Passage } from "./retrieval.js";

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
