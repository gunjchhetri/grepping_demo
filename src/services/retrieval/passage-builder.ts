import type { QueryTerms, ScoredPassage } from "../../types/services/retrieval/document-retriever.js";
import { PassageScorer } from "./passage-scorer.js";

interface LineRange {
  start: number;
  end: number;
}

/** Builds and ranks readable passages from matched document lines. */
export class PassageBuilder {
  // A match window plus the merge gap decides how far apart two hits must be to stay separate passages. Wide
  // values collapse an entire document into one passage, which leaves the ranking nothing to choose between.
  private static readonly nearbyLines = 4;
  private static readonly contextLines = 8;
  private static readonly maxPassages = 8;
  private static readonly pageMarker = /^=== PAGE (\d+) ===$/;

  public constructor(private readonly scorer = new PassageScorer()) {}

  /**
   * Turns a list of matching line numbers into readable passages, best first.
   *
   * A single matching line is usually too little to answer from, so each match is widened to include the lines
   * around it, and matches that end up overlapping become one passage instead of several copies of the same
   * text. Each passage is then scored and only the strongest few are kept.
   */
  public build(
    lines: string[],
    matchedLines: number[],
    documentId: string,
    terms: QueryTerms,
    question: string,
  ): ScoredPassage[] {
    const pageOfLine = PassageBuilder.pageIndex(lines);

    return PassageBuilder.ranges(matchedLines, lines.length)
      .map((range) => {
        const text = lines.slice(range.start - 1, range.end).join("\n");
        const inRange = matchedLines.filter((line) => line >= range.start && line <= range.end);

        return {
          id: `${documentId}:${range.start}-${range.end}`,
          pageNumbers: [...new Set(pageOfLine.slice(range.start - 1, range.end))],
          text,
          score: this.scorer.score(text, terms, question, inRange),
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, PassageBuilder.maxPassages);
  }

  /**
   * Expands each matching line into a block of surrounding lines, then merges blocks that touch.
   *
   * With matches on lines 30 and 34 and a context of 8, both blocks cover roughly lines 22-42, so they merge
   * into one passage rather than two near-identical ones. A match far away on line 300 stays separate.
   */
  private static ranges(matchedLines: number[], lineCount: number): LineRange[] {
    const sorted = [...new Set(matchedLines)].sort((left, right) => left - right);
    const merged: LineRange[] = [];

    for (const line of sorted) {
      const previous = merged.at(-1);
      const range = {
        start: Math.max(1, line - PassageBuilder.contextLines),
        end: Math.min(lineCount, line + PassageBuilder.contextLines),
      };

      if (previous && range.start <= previous.end + PassageBuilder.nearbyLines) {
        previous.end = Math.max(previous.end, range.end);
        continue;
      }

      merged.push(range);
    }

    return merged;
  }

  /**
   * Works out which page number every line belongs to, by counting the `=== PAGE n ===` markers as it goes.
   * This is what lets an answer cite the page a fact came from.
   */
  private static pageIndex(lines: string[]): number[] {
    let page = 1;

    return lines.map((line) => {
      const marker = line.match(PassageBuilder.pageMarker);

      if (marker) {
        page = Number(marker[1]);
      }

      return page;
    });
  }
}
