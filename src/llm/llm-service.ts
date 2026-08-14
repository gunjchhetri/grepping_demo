import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LlmProviderName, Passage, QueryTerms } from "../types.js";
import { LlmProvider } from "./llm-provider.js";

const REQUEST_TIMEOUT_MS = 5000;
const MAX_SOURCES = 5;
const EXPAND_PROMPT = "Return only JSON with exactTerms, keywords, technicalTerms, and phrases as string arrays.";
const ANSWER_PROMPT =
  "You are a grounded document QA assistant. Return JSON with selectedIds (maximum 5) and answer. " +
  "answer must be a single plain-text string that fully responds to the question, even when the " +
  "question has several parts; do not nest it as an object. Cite page numbers when available. " +
  "Use only the supplied passages.";

export interface GroundedAnswer {
  answer: string;
  sourceIds: string[];
}

/** The one place the language model is called: query expansion, then grounded answering. */
export class LlmService {
  public constructor(
    private readonly provider: LlmProviderName,
    private readonly model: string,
  ) {}

  /** Expands a question into search terms. Falls back to the question's own words. */
  public async expandQuery(question: string, broader = false): Promise<QueryTerms> {
    const instruction = broader ? "Create a broader fallback expansion." : "Create a precise expansion.";

    try {
      const raw = await this.complete(EXPAND_PROMPT, ["QUERY_EXPANSION", instruction, question].join("\n"));

      return LlmService.toQueryTerms(parseJson(raw));
    } catch {
      return { exactTerms: [], keywords: keywordsOf(question), technicalTerms: [], phrases: [] };
    }
  }

  /** Picks the passages that answer the question and writes the answer from them. */
  public async answer(question: string, passages: Passage[]): Promise<GroundedAnswer> {
    if (passages.length === 0) {
      return { answer: "I could not find a relevant passage in this document.", sourceIds: [] };
    }

    const raw = await this.complete(
      ANSWER_PROMPT,
      ["RERANK_AND_ANSWER", `Question: ${question}`, JSON.stringify(passages)].join("\n"),
    );

    try {
      const value = parseJson(raw) as { answer?: unknown; selectedIds?: unknown };

      return {
        answer: flattenAnswer(value.answer) ?? "The model did not return a grounded answer.",
        sourceIds: Array.isArray(value.selectedIds)
          ? value.selectedIds.filter((id): id is string => typeof id === "string").slice(0, MAX_SOURCES)
          : [],
      };
    } catch {
      // Not JSON at all: the raw completion is still the best answer available.
      return { answer: raw.trim(), sourceIds: [] };
    }
  }

  private async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const invoke = async (): Promise<string> => {
      const model = await LlmProvider.getModel(this.provider, this.model);
      const result = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);

      if (typeof result.content === "string") {
        return result.content;
      }

      return result.content
        .map((part) => (typeof part === "string" ? part : "text" in part ? String(part.text) : ""))
        .join("");
    };
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM request timed out")), REQUEST_TIMEOUT_MS),
    );

    return Promise.race([invoke(), timeout]);
  }

  private static toQueryTerms(value: unknown): QueryTerms {
    const group = (input: unknown): string[] =>
      Array.isArray(input)
        ? input.filter((term): term is string => typeof term === "string" && term.trim() !== "")
        : [];
    const terms = value as Partial<Record<keyof QueryTerms, unknown>>;

    return {
      exactTerms: group(terms.exactTerms),
      keywords: group(terms.keywords),
      technicalTerms: group(terms.technicalTerms),
      phrases: group(terms.phrases),
    };
  }
}

/** Parses model output whether it is plain JSON or wrapped in a markdown fence. */
function parseJson(raw: string): unknown {
  return JSON.parse(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim(),
  );
}

/**
 * Models often answer a multi-part question with a nested object instead of a string.
 * Flatten it into readable text rather than discarding a correct answer over its shape.
 */
function flattenAnswer(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return join(value.map(flattenAnswer), " ");
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, nested]) => {
      const text = flattenAnswer(nested);

      return text ? `${humanize(key)}: ${text}` : undefined;
    });

    return join(entries, "\n");
  }

  return undefined;
}

function join(parts: (string | undefined)[], separator: string): string | undefined {
  const present = parts.filter((part): part is string => Boolean(part));

  return present.length > 0 ? present.join(separator) : undefined;
}

/** Turns a snake_case or camelCase key into a readable label. */
function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function keywordsOf(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2),
    ),
  ];
}
