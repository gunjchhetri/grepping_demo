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

  /**
   * Returns the line numbers in the file that contain any of the search terms. Line numbers, not text, are the
   * output here: they are what lets nearby matches be grouped into a passage afterwards.
   *
   * Finding nothing is a normal result, not an error, and comes back as an empty array.
   */
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

  /**
   * Runs `rg`, falling back to plain `grep` when the ripgrep binary is not installed on the machine. The
   * fallback rewrites the pattern into the simpler syntax `grep` understands.
   */
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

  /**
   * Merges the four kinds of search term into one de-duplicated list, drops words too common to be worth
   * searching for (`the`, `and`, ...) since they would match nearly every line, and caps the total so the
   * search pattern stays fast.
   */
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

  /**
   * Builds one case-insensitive "match any of these" pattern from the terms, e.g. `(?i)(?:battery|warranty)`.
   * Terms are escaped first so a term containing a character like `.` or `(` is searched for literally rather
   * than being treated as pattern syntax.
   */
  private expression(terms: string[]): string {
    return `(?i)(?:${terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|")})`;
  }

  /** Reads the line numbers out of the search output, whose lines look like `42:some matching text`. */
  private parseLineNumbers(output: string): number[] {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => Number(line.slice(0, line.indexOf(":"))))
      .filter(Number.isInteger);
  }

  /** Reads the process exit code. Search tools use exit code 1 to mean "no matches", which is not a failure. */
  private exitCode(error: unknown): number | undefined {
    return (error as { code?: number })?.code;
  }

  /** Reads the system error name. `ENOENT` here means the `rg` binary is missing, which triggers the fallback. */
  private errorCode(error: unknown): string | undefined {
    return (error as { code?: string })?.code;
  }
}
