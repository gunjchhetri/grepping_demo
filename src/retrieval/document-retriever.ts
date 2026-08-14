import { readFile } from "node:fs/promises";
import type { LlmService } from "../llm/llm-service.js";
import type { Passage } from "../types.js";
import { PassageBuilder } from "./passage-builder.js";
import { RipgrepSearch } from "./ripgrep-search.js";

/**
 * The retrieval pipeline, end to end:
 *
 *   question -> model-generated search terms -> ripgrep -> grouped passages -> ranked passages
 *
 * No embeddings, no index, no vector store. The document is searched where it lies.
 */
export class DocumentRetriever {
  public constructor(
    private readonly llm: LlmService,
    private readonly search = new RipgrepSearch(),
    private readonly builder = new PassageBuilder(),
  ) {}

  /** Finds the passages most likely to answer a question about one document. */
  public async retrieve(filePath: string, documentId: string, question: string): Promise<Passage[]> {
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);
    const precise = await this.rank(filePath, lines, documentId, question, false);
    // A precise expansion can be too narrow to match anything. Widen once before
    // concluding the document has nothing to say about the question.
    const passages = precise.length > 0 ? precise : await this.rank(filePath, lines, documentId, question, true);

    return passages.map(({ id, pageNumbers, text }) => ({ id, pageNumbers, text }));
  }

  private async rank(filePath: string, lines: string[], documentId: string, question: string, broader: boolean) {
    const terms = await this.llm.expandQuery(question, broader);
    const matchedLines = await this.search.matchingLines(filePath, terms);

    return this.builder.build(lines, matchedLines, documentId, terms, question);
  }
}
