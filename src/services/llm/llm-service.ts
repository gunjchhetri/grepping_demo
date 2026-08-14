import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppConstants } from "../../constants/app-constants.js";
import type { LlmProviderName, PassageCandidate, QueryTerms } from "../../types/domain.js";
import { LlmProvider } from "./llm-provider.js";

export class LlmService {
  public constructor(
    private readonly provider: LlmProviderName,
    private readonly model: string,
  ) {}

  /** Expands a user question into terms that are safe for text search. */
  public async expand(question: string, broader = false): Promise<QueryTerms> {
    let raw: string;

    try {
      raw = await this.complete(
        "Return only JSON with exactTerms, keywords, technicalTerms, and phrases as string arrays.",
        [
          "QUERY_EXPANSION",
          broader ? "Create a broader fallback expansion." : "Create a precise expansion.",
          question,
        ].join("\n"),
      );
    } catch {
      return this.fallbackQueryTerms(question);
    }

    try {
      const value = this.parseJson(raw) as Partial<QueryTerms>;

      return this.queryTerms(value);
    } catch {
      return {
        exactTerms: [],
        keywords: question
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((word) => word.length > 2)
          .slice(0, AppConstants.maxSearchTerms),
        technicalTerms: [],
        phrases: [],
      };
    }
  }

  /** Selects grounded passages and writes the final answer content. */
  public async answer(
    question: string,
    candidates: PassageCandidate[],
  ): Promise<{ answer: string; selectedIds: string[] }> {
    if (candidates.length === 0) {
      return { answer: "I could not find a relevant passage in this document.", selectedIds: [] };
    }

    const raw = await this.complete(
      "You are a grounded document QA assistant. Return JSON with selectedIds (maximum 5) and answer. " +
        "answer must be a single plain-text string that fully responds to the question, even when the " +
        "question has several parts; do not nest it as an object. Cite page numbers when available. " +
        "Use only the supplied passages.",
      ["RERANK_AND_ANSWER", `Question: ${question}`, JSON.stringify(candidates)].join("\n"),
    );

    try {
      const value = this.parseJson(raw) as { answer?: unknown; selectedIds?: unknown };
      // Models sometimes structure `answer` as an object or array — especially for
      // multi-part questions. Flatten it into readable text instead of discarding a
      // correct answer just because it did not arrive as a plain string.
      const answer = this.normalizeAnswer(value.answer);

      return {
        answer: answer ?? "The model did not return a grounded answer.",
        selectedIds: Array.isArray(value.selectedIds)
          ? value.selectedIds
              .filter((id): id is string => typeof id === "string")
              .slice(0, AppConstants.maxSelectedPassages)
          : [],
      };
    } catch {
      return { answer: raw.trim(), selectedIds: [] };
    }
  }

  /** Coerces a string, array, or object answer field into readable plain text. */
  private normalizeAnswer(value: unknown): string | undefined {
    if (typeof value === "string") {
      return value.trim() || undefined;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      const parts = value.map((item) => this.normalizeAnswer(item)).filter((part): part is string => Boolean(part));

      return parts.length > 0 ? parts.join(" ") : undefined;
    }

    if (value !== null && typeof value === "object") {
      const parts = Object.entries(value)
        .map(([key, nested]) => {
          const text = this.normalizeAnswer(nested);

          return text ? `${this.humanizeKey(key)}: ${text}` : undefined;
        })
        .filter((part): part is string => Boolean(part));

      return parts.length > 0 ? parts.join("\n") : undefined;
    }

    return undefined;
  }

  /** Turns a snake_case or camelCase answer key into a human-readable label. */
  private humanizeKey(key: string): string {
    const spaced = key
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .trim();

    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  private async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const invoke = async (): Promise<string> => {
      const result = await (
        await LlmProvider.getModel(this.provider, this.model)
      ).invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);

      if (typeof result.content === "string") {
        return result.content;
      }

      return result.content
        .map((part) => (typeof part === "string" ? part : "text" in part ? String(part.text) : ""))
        .join("");
    };

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("LLM request timed out")), AppConstants.llmRequestTimeoutMs);
    });

    return Promise.race([invoke(), timeout]);
  }

  private fallbackQueryTerms(question: string): QueryTerms {
    const keywords = [
      ...new Set(
        question
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((word) => word.length > 2),
      ),
    ].slice(0, AppConstants.maxSearchTerms);

    return { exactTerms: [], keywords, technicalTerms: [], phrases: [] };
  }

  /** Parses provider JSON whether it is plain or wrapped in a markdown code fence. */
  private parseJson(raw: string): unknown {
    const normalized = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    return JSON.parse(normalized);
  }

  private queryTerms(value: Partial<QueryTerms>): QueryTerms {
    const strings = (input: unknown): string[] =>
      Array.isArray(input)
        ? input
            .filter((term): term is string => typeof term === "string" && term.trim().length > 0)
            .map((term) => term.trim())
        : [];

    return {
      exactTerms: strings(value.exactTerms),
      keywords: strings(value.keywords),
      technicalTerms: strings(value.technicalTerms),
      phrases: strings(value.phrases),
    };
  }
}
