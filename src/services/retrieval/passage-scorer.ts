import type { QueryTerms } from "../../types/services/retrieval/document-retriever.js";

/** Scores passages using explainable lexical signals. */
export class PassageScorer {
  private static readonly exactWeight = 4;
  private static readonly technicalWeight = 3;
  private static readonly keywordWeight = 2;
  private static readonly maxProximity = 10;

  public score(text: string, terms: QueryTerms, question: string, matchedLines: number[]): number {
    const lower = text.toLowerCase();

    return (
      this.occurrences(lower, terms.exactTerms, PassageScorer.exactWeight) +
      this.occurrences(lower, terms.technicalTerms, PassageScorer.technicalWeight) +
      this.coverage(lower, terms, question) +
      this.proximity(matchedLines)
    );
  }

  private occurrences(text: string, terms: string[], weight: number): number {
    return terms.reduce((total, term) => total + (text.split(term.toLowerCase()).length - 1) * weight, 0);
  }

  private coverage(text: string, terms: QueryTerms, question: string): number {
    const words = [...terms.keywords, ...terms.phrases, ...question.toLowerCase().split(/\s+/)];
    const present = words.filter((word) => word.length > 2 && text.includes(word));

    return new Set(present).size * PassageScorer.keywordWeight;
  }

  private proximity(matchedLines: number[]): number {
    if (matchedLines.length <= 1) {
      return 1;
    }

    const spread = Math.max(...matchedLines) - Math.min(...matchedLines);

    return Math.max(1, PassageScorer.maxProximity - spread);
  }
}
