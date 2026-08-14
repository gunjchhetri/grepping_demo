import type { QueryTerms, ScoredPassage } from "../../types/retrieval.js";
import { PassageScorer } from "./passage-scorer.js";

interface LineRange {
  start: number;
  end: number;
}

/**
 * Turns matching line numbers into readable passages.
 *
 * Matches close to each other become one passage, each passage is padded with
 * surrounding context, overlapping passages are merged, and the result is ranked.
 */
export class PassageBuilder {
  private static readonly nearbyLines = 12;
  private static readonly contextLines = 20;
  private static readonly maxPassages = 8;
  private static readonly pageMarker = /^=== PAGE (\d+) ===$/;

  public constructor(private readonly scorer = new PassageScorer()) {}

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

  /** Groups nearby matches, pads each group with context, then merges overlaps. */
  private static ranges(matchedLines: number[], lineCount: number): LineRange[] {
    const sorted = [...new Set(matchedLines)].sort((left, right) => left - right);
    const merged: LineRange[] = [];

    for (const line of sorted) {
      const previous = merged.at(-1);
      const range = {
        start: Math.max(1, line - PassageBuilder.contextLines),
        end: Math.min(lineCount, line + PassageBuilder.contextLines),
      };

      // Extend the open range when this match belongs to the same neighbourhood,
      // which is what keeps one topic in one passage instead of many fragments.
      if (previous && range.start <= previous.end + PassageBuilder.nearbyLines) {
        previous.end = Math.max(previous.end, range.end);
        continue;
      }

      merged.push(range);
    }

    return merged;
  }

  /** Maps every line to the page it belongs to, using the markers the extractor wrote. */
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
