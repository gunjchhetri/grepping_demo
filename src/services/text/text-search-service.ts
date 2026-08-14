import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppConstants } from "../../constants/app-constants.js";
import type { PassageCandidate, QueryTerms, RetrievalDebug, RipgrepMatch } from "../../types/domain.js";

const execFileAsync = promisify(execFile);

type LineRange = {
  start: number;
  end: number;
};

/**
 * Searches extracted document text with ripgrep and turns matching lines into ranked passages.
 * The passages retain line ranges and page numbers so the LLM can answer with document context.
 *
 * Real-life example:
 * A user asks, "How does Lambda process S3 events?" The service may find one passage that
 * contains "Lambda", "S3 events", and "notification" on nearby lines, and another passage
 * that only mentions Lambda memory settings. The first passage receives the higher score
 * because it contains more relevant terms and the matches are close together, so it is sent
 * to the LLM before the less relevant passage.
 */
export class TextSearchService {
  /**
   * Runs the retrieval pipeline for one document.
   *
   * The pipeline is intentionally sequential:
   * 1. Search the document with ripgrep.
   * 2. Read the document lines so surrounding context can be extracted.
   * 3. Group nearby matching lines into meaningful sections.
   * 4. Build, score, rank, and limit passage candidates.
   *
   * The returned matches, groups, and candidates are also used as retrieval-debug information.
   */
  public async search(
    filePath: string,
    documentId: string,
    question: string,
    terms: QueryTerms,
  ): Promise<Pick<RetrievalDebug, "matches" | "groups" | "candidates">> {
    // Normalize the LLM-generated terms once. If there is nothing useful to search,
    // there is no reason to read the document or create empty passage objects.
    const searchTerms = this.searchTerms(terms);

    if (searchTerms.length === 0) {
      return { matches: [], groups: [], candidates: [] };
    }

    // First find the exact lines that contain at least one search term.
    const matches = await this.findMatches(filePath, searchTerms);
    // Read all lines because a useful passage includes context around each match,
    // not only the single line returned by ripgrep.
    const lines = await this.readLines(filePath);
    // Convert individual matching lines into nearby line groups.
    // Example: [10, 12, 13, 80] becomes [[10, 12, 13], [80]].
    const groups = this.groupLines(matches.map((match) => match.lineNumber));
    // Turn each group into a passage, calculate its relevance score,
    // sort the passages from most relevant to least relevant, and keep the top candidates.
    const candidates = this.createPassages(lines, documentId, matches, groups, terms, question);

    return { matches, groups, candidates };
  }

  /** Reads the extracted document and preserves its original line boundaries for range calculations. */
  private async readLines(filePath: string): Promise<string[]> {
    return (await readFile(filePath, "utf8")).split(/\r?\n/);
  }

  /** Builds a ripgrep expression, executes the search, and converts matching output into domain objects. */
  private async findMatches(filePath: string, searchTerms: string[]): Promise<RipgrepMatch[]> {
    const expression = this.searchExpression(searchTerms);

    try {
      const output = await this.runRipgrep(filePath, expression);

      return this.parseMatches(output, searchTerms);
    } catch (error: unknown) {
      if (this.isNoMatchError(error)) {
        return [];
      }

      throw new Error(`ripgrep search failed: ${String(error)}`, { cause: error });
    }
  }

  /** Converts merged match ranges into passage candidates, then ranks and limits the results. */
  private createPassages(
    lines: string[],
    documentId: string,
    matches: RipgrepMatch[],
    groups: number[][],
    terms: QueryTerms,
    question: string,
  ): PassageCandidate[] {
    const mergedRanges = this.createMergedRanges(groups, lines.length);

    return mergedRanges
      .map((range) => this.createPassage(lines, documentId, matches, range, terms, question))
      .sort((left, right) => right.lexicalScore - left.lexicalScore)
      .slice(0, AppConstants.maxCandidatePassages);
  }

  /** Creates one passage with its text, page numbers, matched terms, and lexical score. */
  private createPassage(
    lines: string[],
    documentId: string,
    matches: RipgrepMatch[],
    range: LineRange,
    terms: QueryTerms,
    question: string,
  ): PassageCandidate {
    const nearbyMatches = this.matchesInRange(matches, range);
    const text = this.textInRange(lines, range);

    return {
      id: `${documentId}:${range.start}-${range.end}`,
      documentId,
      startLine: range.start,
      endLine: range.end,
      pageNumbers: this.pages(lines, range),
      text,
      matchedTerms: [...new Set(nearbyMatches.flatMap((match) => match.matchedTerms))],
      matchLineNumbers: nearbyMatches.map((match) => match.lineNumber),
      lexicalScore: this.score(text, terms, question, nearbyMatches),
    };
  }

  /** Returns only the ripgrep matches whose line numbers fall inside a passage range. */
  private matchesInRange(matches: RipgrepMatch[], range: LineRange): RipgrepMatch[] {
    return matches.filter((match) => match.lineNumber >= range.start && match.lineNumber <= range.end);
  }

  /** Extracts the text represented by a one-based inclusive line range. */
  private textInRange(lines: string[], range: LineRange): string {
    return lines.slice(range.start - 1, range.end).join("\n");
  }

  /** Groups match lines when consecutive matches are close enough to share one passage. */
  private groupLines(numbers: number[]): number[][] {
    const groups: number[][] = [];
    const uniqueNumbers = [...new Set(numbers)].sort((left, right) => left - right);

    for (const number of uniqueNumbers) {
      const currentGroup = groups.at(-1);

      if (!currentGroup || number - currentGroup.at(-1)! > AppConstants.nearbyLineDistance) {
        groups.push([number]);
        continue;
      }

      currentGroup.push(number);
    }

    return groups;
  }

  /** Adds context around match groups and combines overlapping ranges into unique passage ranges. */
  private createMergedRanges(groups: number[][], lineCount: number): LineRange[] {
    const ranges = groups.map((group) => ({
      start: Math.max(1, Math.min(...group) - AppConstants.passagePaddingLines),
      end: Math.min(lineCount, Math.max(...group) + AppConstants.passagePaddingLines),
    }));
    const mergedRanges: LineRange[] = [];
    const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);

    for (const range of sortedRanges) {
      const previousRange = mergedRanges.at(-1);

      if (!previousRange || range.start > previousRange.end + 1) {
        mergedRanges.push({ ...range });
        continue;
      }

      previousRange.end = Math.max(previousRange.end, range.end);
    }

    return mergedRanges;
  }

  /** Reads page markers from the extracted text and returns pages covered by the range. */
  private pages(lines: string[], range: LineRange): number[] {
    const pageNumbers = new Set<number>();
    let currentPage = 1;

    for (const [index, line] of lines.entries()) {
      const marker = line.match(/^=== PAGE (\d+) ===$/);

      if (marker) {
        currentPage = Number(marker[1]);
      }

      const lineNumber = index + 1;

      if (lineNumber >= range.start && lineNumber <= range.end) {
        pageNumbers.add(currentPage);
      }
    }

    return [...pageNumbers];
  }

  /**
   * Calculates a passage score from four signals:
   * - exact terms: 4 points for every occurrence
   * - technical terms: 3 points for every occurrence
   * - keywords, phrases, and meaningful question words: 2 points per unique match
   * - proximity: 1 to 10 points when matching lines are close together
   *
   * A higher score means the passage is more likely to answer the question.
   */
  private score(text: string, terms: QueryTerms, question: string, matches: RipgrepMatch[]): number {
    const lower = text.toLowerCase();
    const exactScore = this.termScore(lower, terms.exactTerms, 4);
    const technicalScore = this.termScore(lower, terms.technicalTerms, 3);
    const keywordScore = this.keywordScore(lower, terms, question);
    const proximityScore = this.proximityScore(matches);

    return exactScore + technicalScore + keywordScore + proximityScore;
  }

  /** Counts occurrences of each term and applies the weight for that term category. */
  private termScore(text: string, terms: string[], multiplier: number): number {
    return terms.reduce((score, term) => score + this.count(text, term) * multiplier, 0);
  }

  /** Rewards passages containing unique keywords, phrases, or meaningful words from the question. */
  private keywordScore(text: string, terms: QueryTerms, question: string): number {
    const words = [...terms.keywords, ...terms.phrases, ...question.toLowerCase().split(/\s+/)];
    const matchingWords = words.filter((term) => term.length > 2 && text.includes(term));

    return new Set(matchingWords).size * 2;
  }

  /** Rewards matches that occur close together and gives every passage a minimum proximity score. */
  private proximityScore(matches: RipgrepMatch[]): number {
    if (matches.length <= 1) {
      return 1;
    }

    const lineNumbers = matches.map((match) => match.lineNumber);
    const distance = Math.max(...lineNumbers) - Math.min(...lineNumbers);

    return Math.max(1, 10 - distance);
  }

  /** Normalizes, deduplicates, and limits all LLM-generated terms used by ripgrep. */
  private searchTerms(query: QueryTerms): string[] {
    return [
      ...new Set(
        [...query.exactTerms, ...query.keywords, ...query.technicalTerms, ...query.phrases]
          .map((term) => term.trim())
          .filter((term) => term.length > 1),
      ),
    ].slice(0, AppConstants.maxSearchTerms);
  }

  /** Creates one case-insensitive regular expression from the escaped search terms. */
  private searchExpression(terms: string[]): string {
    return `(?i)(?:${terms.map((term) => this.escapeRegex(term)).join("|")})`;
  }

  /** Runs ripgrep with line numbers and plain output so each match can be parsed reliably. */
  private async runRipgrep(filePath: string, expression: string): Promise<string> {
    try {
      const result = await execFileAsync(
        "rg",
        ["-n", "--no-heading", "--color", "never", "--pcre2", expression, filePath],
        { maxBuffer: 2 * 1024 * 1024 },
      );

      return result.stdout;
    } catch (error: unknown) {
      // The optional Lambda layer is not configured in the default demo stack. Keep
      // retrieval functional with the runtime's standard grep instead of failing the
      // whole question when only the `rg` executable is unavailable.
      if (!this.isMissingRipgrep(error)) {
        throw error;
      }

      const grepExpression = expression.replace(/^\(\?i\)/, "").replace(/\(\?:/g, "(");
      const result = await execFileAsync("grep", ["-n", "-h", "-i", "-E", "--", grepExpression, filePath], {
        maxBuffer: 2 * 1024 * 1024,
      });

      return result.stdout;
    }
  }

  /** Converts ripgrep's newline-delimited output into validated match records. */
  private parseMatches(output: string, terms: string[]): RipgrepMatch[] {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => this.parseMatch(line, terms))
      .filter((match) => Number.isInteger(match.lineNumber));
  }

  /** Parses one ripgrep line into a line number, source text, and matching search terms. */
  private parseMatch(rawMatch: string, terms: string[]): RipgrepMatch {
    const separator = rawMatch.indexOf(":");
    const content = rawMatch.slice(separator + 1);

    return {
      lineNumber: Number(rawMatch.slice(0, separator)),
      line: content,
      matchedTerms: terms.filter((term) => content.toLowerCase().includes(term.toLowerCase())),
    };
  }

  /** Identifies ripgrep's exit code 1, which means the search completed without matches. */
  private isNoMatchError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 1;
  }

  /** Identifies a missing optional ripgrep executable so standard grep can be used. */
  private isMissingRipgrep(error: unknown): boolean {
    return (
      typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
    );
  }

  /** Counts case-insensitive occurrences of a term in already-normalized text. */
  private count(text: string, term: string): number {
    return text.split(term.toLowerCase()).length - 1;
  }

  /** Escapes regex metacharacters so user or model terms are searched as literal text. */
  private escapeRegex(value: string): string {
    return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
}
