import type { QueryTerms } from "../../types/services/retrieval/document-retriever.js";

/** Scores passages using explainable lexical signals. */
export class PassageScorer {
  private static readonly exactWeight = 4;
  private static readonly technicalWeight = 3;
  private static readonly keywordWeight = 2;
  private static readonly maxProximity = 10;

  /**
   * Rates how well one passage fits the question. Higher is better, and the number only has meaning when
   * comparing passages from the same search.
   *
   * It adds up four things: how often the exact search terms appear, how often the technical ones do, how many
   * distinct question words show up at all, and how tightly the matches sit together.
   */
  public score(text: string, terms: QueryTerms, question: string, matchedLines: number[]): number {
    const lower = text.toLowerCase();

    return (
      this.occurrences(lower, terms.exactTerms, PassageScorer.exactWeight) +
      this.occurrences(lower, terms.technicalTerms, PassageScorer.technicalWeight) +
      this.coverage(lower, terms, question) +
      this.proximity(matchedLines)
    );
  }

  /** Counts how many times each term appears and multiplies by that term type's weight. */
  private occurrences(text: string, terms: string[], weight: number): number {
    return terms.reduce((total, term) => total + (text.split(term.toLowerCase()).length - 1) * weight, 0);
  }

  /**
   * Rewards breadth rather than repetition: how many *different* question words the passage contains at all.
   * A passage mentioning four of the asked-about words beats one repeating a single word four times.
   */
  private coverage(text: string, terms: QueryTerms, question: string): number {
    const words = [...terms.keywords, ...terms.phrases, ...question.toLowerCase().split(/\s+/)];
    const present = words.filter((word) => word.length > 2 && text.includes(word));

    return new Set(present).size * PassageScorer.keywordWeight;
  }

  /**
   * Rewards matches that sit close together. Words found on adjacent lines are usually part of one statement,
   * whereas the same words spread far apart are more likely to be unrelated mentions.
   */
  private proximity(matchedLines: number[]): number {
    if (matchedLines.length <= 1) {
      return 1;
    }

    const spread = Math.max(...matchedLines) - Math.min(...matchedLines);

    return Math.max(1, PassageScorer.maxProximity - spread);
  }
}
