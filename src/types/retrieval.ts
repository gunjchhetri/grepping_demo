/** Search terms the model derives from a question, grouped by how strongly each one counts. */
export interface QueryTerms {
  exactTerms: string[];
  keywords: string[];
  technicalTerms: string[];
  phrases: string[];
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
