import { Logger } from "@aws-lambda-powertools/logger";
import type { Passage } from "../../types/services/retrieval/document-retriever.js";
import type { MountedDocumentStore } from "../../infrastructure/filesystem/mounted-document-store.js";
import type { LlmService } from "../llm/llm-service.js";
import type { RipgrepTextSearch } from "../../infrastructure/retrieval/ripgrep-text-search.js";
import { PassageBuilder } from "./passage-builder.js";

/** Coordinates query expansion, lexical search, passage construction, and ranking. */
export class DocumentRetriever {
  private readonly logger = new Logger({ serviceName: "question-api" });

  public constructor(
    private readonly files: MountedDocumentStore,
    private readonly llm: LlmService,
    private readonly search: RipgrepTextSearch,
    private readonly builder = new PassageBuilder(),
  ) {}

  /**
   * Finds the parts of one document that could answer the question.
   *
   * Runs the search twice at most. The first pass uses a precise set of search terms; if that matches nothing
   * anywhere in the file, the second pass asks for a looser set and tries again, so a question worded
   * differently to the document still has a chance. Whatever comes back is then handed to the model to drop
   * any passage that only shares words with the question.
   *
   * Returns an empty array when the document genuinely has nothing on the subject, which the caller turns
   * into a "not enough information" reply rather than letting the model answer from its own knowledge.
   */
  public async retrieve(documentKey: string, documentId: string, question: string): Promise<Passage[]> {
    const filePath = this.files.requirePath(documentKey);
    const lines = (await this.files.readText(documentKey)).split(/\r?\n/);
    const precise = await this.rank(filePath, lines, documentId, question, false);
    const passages = precise.length > 0 ? precise : await this.rank(filePath, lines, documentId, question, true);

    return this.llm.selectRelevant(
      question,
      passages.map(({ id, pageNumbers, text }) => ({ id, pageNumbers, text })),
    );
  }

  /**
   * One search attempt: turn the question into search terms, find the matching line numbers, then group those
   * lines into passages and score them. `broader` asks for the looser terms used by the retry.
   */
  private async rank(filePath: string, lines: string[], documentId: string, question: string, broader: boolean) {
    const terms = await this.llm.expandQuery(question, broader);
    const matchedLines = await this.search.matchingLines(filePath, terms);
    const passages = this.builder.build(lines, matchedLines, documentId, terms, question);

    this.logger.info(broader ? "Broader retry" : "Precise pass", {
      terms: [...terms.exactTerms, ...terms.keywords, ...terms.technicalTerms, ...terms.phrases],
      matchedLines: matchedLines.length,
      passages: passages.length,
    });

    return passages;
  }
}
