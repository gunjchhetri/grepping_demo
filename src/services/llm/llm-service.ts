import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LlmProviderName } from "../../types/llm.js";
import type { Passage, QueryTerms } from "../../types/retrieval.js";
import { LlmProvider } from "./llm-provider.js";
import { ModelOutputParser } from "./model-output-parser.js";

export interface GroundedAnswer {
  answer: string;
  sourceIds: string[];
}

/** The one place the language model is called: query expansion, then grounded answering. */
export class LlmService {
  private static readonly requestTimeoutMs = 5000;
  private static readonly maxSources = 5;
  private static readonly expandPrompt =
    "Return only JSON with exactTerms, keywords, technicalTerms, and phrases as string arrays.";
  private static readonly answerPrompt =
    "You are a grounded document QA assistant. Return JSON with selectedIds (maximum 5) and answer. " +
    "answer must be a single plain-text string that fully responds to the question, even when the " +
    "question has several parts; do not nest it as an object. Cite page numbers when available. " +
    "Use only the supplied passages.";

  public constructor(
    private readonly provider: LlmProviderName,
    private readonly model: string,
    private readonly parser = new ModelOutputParser(),
  ) {}

  /** Expands a question into search terms. Falls back to the question's own words. */
  public async expandQuery(question: string, broader = false): Promise<QueryTerms> {
    const instruction = broader ? "Create a broader fallback expansion." : "Create a precise expansion.";

    try {
      const raw = await this.complete(LlmService.expandPrompt, ["QUERY_EXPANSION", instruction, question].join("\n"));

      return this.parser.toQueryTerms(this.parser.parseJson(raw));
    } catch {
      return this.parser.fallbackTerms(question);
    }
  }

  /** Picks the passages that answer the question and writes the answer from them. */
  public async answer(question: string, passages: Passage[]): Promise<GroundedAnswer> {
    if (passages.length === 0) {
      return { answer: "I could not find a relevant passage in this document.", sourceIds: [] };
    }

    const raw = await this.complete(
      LlmService.answerPrompt,
      ["RERANK_AND_ANSWER", `Question: ${question}`, JSON.stringify(passages)].join("\n"),
    );

    try {
      const value = this.parser.parseJson(raw) as { answer?: unknown; selectedIds?: unknown };

      return {
        answer: this.parser.flattenAnswer(value.answer) ?? "The model did not return a grounded answer.",
        sourceIds: Array.isArray(value.selectedIds)
          ? value.selectedIds.filter((id): id is string => typeof id === "string").slice(0, LlmService.maxSources)
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
      setTimeout(() => reject(new Error("LLM request timed out")), LlmService.requestTimeoutMs),
    );

    return Promise.race([invoke(), timeout]);
  }
}
