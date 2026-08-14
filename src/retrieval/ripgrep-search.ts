import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { QueryTerms } from "../types.js";

const execFileAsync = promisify(execFile);
const MAX_TERMS = 12;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Runs ripgrep over a mounted document and reports which lines matched. */
export class RipgrepSearch {
  /** Returns the line numbers matching any query term, empty when nothing matches. */
  public async matchingLines(filePath: string, terms: QueryTerms): Promise<number[]> {
    const searchTerms = RipgrepSearch.flatten(terms);

    if (searchTerms.length === 0) {
      return [];
    }

    try {
      const output = await this.run(filePath, RipgrepSearch.expression(searchTerms));

      return RipgrepSearch.parseLineNumbers(output);
    } catch (error: unknown) {
      // Exit code 1 is ripgrep's "searched fine, found nothing".
      if (exitCode(error) === 1) {
        return [];
      }

      throw new Error(`ripgrep search failed: ${String(error)}`, { cause: error });
    }
  }

  private async run(filePath: string, expression: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "rg",
        ["-n", "--no-heading", "--color", "never", "--pcre2", expression, filePath],
        { maxBuffer: MAX_OUTPUT_BYTES },
      );

      return stdout;
    } catch (error: unknown) {
      // The ripgrep Lambda layer is optional. When `rg` is absent, fall back to the
      // runtime's grep so the demo keeps working instead of failing the question.
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }

      const { stdout } = await execFileAsync(
        "grep",
        ["-n", "-h", "-i", "-E", "--", expression.replace(/^\(\?i\)/, "").replace(/\(\?:/g, "("), filePath],
        { maxBuffer: MAX_OUTPUT_BYTES },
      );

      return stdout;
    }
  }

  /** Normalizes, deduplicates, and caps every model-generated term. */
  private static flatten(terms: QueryTerms): string[] {
    const all = [...terms.exactTerms, ...terms.keywords, ...terms.technicalTerms, ...terms.phrases];

    return [...new Set(all.map((term) => term.trim()).filter((term) => term.length > 1))].slice(0, MAX_TERMS);
  }

  /** Builds one case-insensitive alternation. Terms are escaped so they match literally. */
  private static expression(terms: string[]): string {
    return `(?i)(?:${terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|")})`;
  }

  private static parseLineNumbers(output: string): number[] {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => Number(line.slice(0, line.indexOf(":"))))
      .filter(Number.isInteger);
  }
}

function exitCode(error: unknown): number | undefined {
  return (error as { code?: number })?.code;
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string })?.code;
}
