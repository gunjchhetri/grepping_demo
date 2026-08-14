import type { QueryTerms } from "../../types/retrieval.js";

/** Makes sense of the loosely-shaped JSON language models return. */
export class ModelOutputParser {
  /** Parses model output whether it is plain JSON or wrapped in a markdown fence. */
  public parseJson(raw: string): unknown {
    return JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim(),
    );
  }

  /** Coerces a parsed expansion into query terms, ignoring anything malformed. */
  public toQueryTerms(value: unknown): QueryTerms {
    const terms = value as Partial<Record<keyof QueryTerms, unknown>>;

    return {
      exactTerms: this.stringArray(terms.exactTerms),
      keywords: this.stringArray(terms.keywords),
      technicalTerms: this.stringArray(terms.technicalTerms),
      phrases: this.stringArray(terms.phrases),
    };
  }

  /** Query terms used when the model cannot be reached: the question's own words. */
  public fallbackTerms(question: string): QueryTerms {
    const keywords = [
      ...new Set(
        question
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((word) => word.length > 2),
      ),
    ];

    return { exactTerms: [], keywords, technicalTerms: [], phrases: [] };
  }

  /**
   * Models often answer a multi-part question with a nested object instead of a string.
   * Flatten it into readable text rather than discarding a correct answer over its shape.
   */
  public flattenAnswer(value: unknown): string | undefined {
    if (typeof value === "string") {
      return value.trim() || undefined;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      return this.join(
        value.map((item) => this.flattenAnswer(item)),
        " ",
      );
    }

    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value).map(([key, nested]) => {
        const text = this.flattenAnswer(nested);

        return text ? `${this.humanize(key)}: ${text}` : undefined;
      });

      return this.join(entries, "\n");
    }

    return undefined;
  }

  private stringArray(input: unknown): string[] {
    return Array.isArray(input)
      ? input.filter((term): term is string => typeof term === "string" && term.trim() !== "")
      : [];
  }

  private join(parts: (string | undefined)[], separator: string): string | undefined {
    const present = parts.filter((part): part is string => Boolean(part));

    return present.length > 0 ? present.join(separator) : undefined;
  }

  /** Turns a snake_case or camelCase key into a readable label. */
  private humanize(key: string): string {
    const spaced = key
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .trim();

    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
}
