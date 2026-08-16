export interface QueryTerms {
  exactTerms: string[];
  keywords: string[];
  technicalTerms: string[];
  phrases: string[];
}

export interface Passage {
  id: string;
  pageNumbers: number[];
  text: string;
}

export interface ScoredPassage extends Passage {
  score: number;
}
