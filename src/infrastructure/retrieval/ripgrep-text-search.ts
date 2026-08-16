import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { QueryTerms } from "../../types/services/retrieval/document-retriever.js";

/** Adapter for the external ripgrep/grep processes used by retrieval. */
export class RipgrepTextSearch {
  private static readonly execFileAsync = promisify(execFile);
  private static readonly maxTerms = 12;
  private static readonly maxOutputBytes = 2 * 1024 * 1024;
  private static readonly stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "does",
    "for",
    "from",
    "how",
    "into",
    "is",
    "its",
    "much",
    "of",
    "or",
    "that",
    "the",
    "their",
    "them",
    "these",
    "this",
    "those",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
  ]);

  public async matchingLines(filePath: string, terms: QueryTerms): Promise<number[]> {
    const searchTerms = this.flatten(terms);

    if (searchTerms.length === 0) {
      return [];
    }

    try {
      const output = await this.run(filePath, this.expression(searchTerms));

      return this.parseLineNumbers(output);
    } catch (error: unknown) {
      if (this.exitCode(error) === 1) {
        return [];
      }

      throw new Error(`Text search failed: ${String(error)}`, { cause: error });
    }
  }

  private async run(filePath: string, expression: string): Promise<string> {
    try {
      const { stdout } = await RipgrepTextSearch.execFileAsync(
        "rg",
        ["-n", "--no-heading", "--color", "never", "--pcre2", expression, filePath],
        { maxBuffer: RipgrepTextSearch.maxOutputBytes },
      );

      return stdout;
    } catch (error: unknown) {
      if (this.errorCode(error) !== "ENOENT") {
        throw error;
      }

      const { stdout } = await RipgrepTextSearch.execFileAsync(
        "grep",
        ["-n", "-h", "-i", "-E", "--", expression.replace(/^\(\?i\)/, "").replace(/\(\?:/g, "("), filePath],
        { maxBuffer: RipgrepTextSearch.maxOutputBytes },
      );

      return stdout;
    }
  }

  private flatten(terms: QueryTerms): string[] {
    const all = [...terms.exactTerms, ...terms.keywords, ...terms.technicalTerms, ...terms.phrases];

    return [
      ...new Set(
        all
          .map((term) => term.trim())
          .filter((term) => term.length > 1 && !RipgrepTextSearch.stopWords.has(term.toLowerCase())),
      ),
    ].slice(0, RipgrepTextSearch.maxTerms);
  }

  private expression(terms: string[]): string {
    return `(?i)(?:${terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|")})`;
  }

  private parseLineNumbers(output: string): number[] {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => Number(line.slice(0, line.indexOf(":"))))
      .filter(Number.isInteger);
  }

  private exitCode(error: unknown): number | undefined {
    return (error as { code?: number })?.code;
  }

  private errorCode(error: unknown): string | undefined {
    return (error as { code?: string })?.code;
  }
}
