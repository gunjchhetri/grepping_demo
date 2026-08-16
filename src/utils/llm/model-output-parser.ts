import type { QueryTerms } from "../../types/services/retrieval/document-retriever.js";

export interface SupportedAnswer {
  supported: boolean;
  answer: string;
  evidence: string[];
}

/** Converts untrusted model output into application-level values. */
export class ModelOutputParser {
  public parseJson(raw: string): unknown {
    return JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim(),
    );
  }

  public toQueryTerms(value: unknown): QueryTerms {
    const terms = this.record(value);

    return {
      exactTerms: this.stringArray(terms.exactTerms),
      keywords: this.stringArray(terms.keywords),
      technicalTerms: this.stringArray(terms.technicalTerms),
      phrases: this.stringArray(terms.phrases),
    };
  }

  public fallbackTerms(question: string): QueryTerms {
    const keywords = [
      ...new Set(
        question
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((word) => word.length > 2 && !ModelOutputParser.stopWords.has(word)),
      ),
    ];

    return { exactTerms: [], keywords, technicalTerms: [], phrases: [] };
  }

  public toSupportedAnswer(value: unknown): SupportedAnswer | undefined {
    const answer = this.record(value);

    if (typeof answer.supported !== "boolean" || typeof answer.answer !== "string" || !answer.answer.trim()) {
      return undefined;
    }

    return {
      supported: answer.supported,
      answer: answer.answer.trim(),
      evidence: this.stringArray(answer.evidence),
    };
  }

  public static readonly stopWords = new Set([
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

  private record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringArray(input: unknown): string[] {
    return Array.isArray(input)
      ? [
          ...new Set(
            input
              .filter((term): term is string => typeof term === "string" && term.trim() !== "")
              .map((term) => term.trim()),
          ),
        ]
      : [];
  }
}
