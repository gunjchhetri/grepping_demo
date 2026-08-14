import type { QueryTerms } from "../types.js";

const EXACT_WEIGHT = 4;
const TECHNICAL_WEIGHT = 3;
const KEYWORD_WEIGHT = 2;
const MAX_PROXIMITY = 10;

/**
 * Ranks a passage by how strongly it answers the question.
 *
 * Four signals are added together:
 * - every occurrence of an exact term scores 4
 * - every occurrence of a technical term scores 3
 * - each unique keyword, phrase, or meaningful question word scores 2
 * - matches sitting close together score 1 to 10
 */
export class PassageScorer {
  public score(text: string, terms: QueryTerms, question: string, matchedLines: number[]): number {
    const lower = text.toLowerCase();

    return (
      this.occurrences(lower, terms.exactTerms, EXACT_WEIGHT) +
      this.occurrences(lower, terms.technicalTerms, TECHNICAL_WEIGHT) +
      this.coverage(lower, terms, question) +
      this.proximity(matchedLines)
    );
  }

  /** Counts every occurrence of each term and applies that category's weight. */
  private occurrences(text: string, terms: string[], weight: number): number {
    return terms.reduce((total, term) => total + (text.split(term.toLowerCase()).length - 1) * weight, 0);
  }

  /** Rewards breadth: how many distinct relevant words appear at all. */
  private coverage(text: string, terms: QueryTerms, question: string): number {
    const words = [...terms.keywords, ...terms.phrases, ...question.toLowerCase().split(/\s+/)];
    const present = words.filter((word) => word.length > 2 && text.includes(word));

    return new Set(present).size * KEYWORD_WEIGHT;
  }

  /** Rewards matches that cluster together rather than scattering across the passage. */
  private proximity(matchedLines: number[]): number {
    if (matchedLines.length <= 1) {
      return 1;
    }

    const spread = Math.max(...matchedLines) - Math.min(...matchedLines);

    return Math.max(1, MAX_PROXIMITY - spread);
  }
}
