import type { Passage } from "../../types/services/retrieval/document-retriever.js";
import type { MountedDocumentStore } from "../../infrastructure/filesystem/mounted-document-store.js";
import type { LlmService } from "../llm/llm-service.js";
import type { RipgrepTextSearch } from "../../infrastructure/retrieval/ripgrep-text-search.js";
import { PassageBuilder } from "./passage-builder.js";

/** Coordinates query expansion, lexical search, passage construction, and ranking. */
export class DocumentRetriever {
  public constructor(
    private readonly files: MountedDocumentStore,
    private readonly llm: LlmService,
    private readonly search: RipgrepTextSearch,
    private readonly builder = new PassageBuilder(),
  ) {}

  public async retrieve(documentKey: string, documentId: string, question: string): Promise<Passage[]> {
    const filePath = this.files.requirePath(documentKey);
    const lines = (await this.files.readText(documentKey)).split(/\r?\n/);
    const precise = await this.rank(filePath, lines, documentId, question, false);
    const passages = precise.length > 0 ? precise : await this.rank(filePath, lines, documentId, question, true);

    return passages.map(({ id, pageNumbers, text }) => ({ id, pageNumbers, text }));
  }

  private async rank(filePath: string, lines: string[], documentId: string, question: string, broader: boolean) {
    const terms = await this.llm.expandQuery(question, broader);
    const matchedLines = await this.search.matchingLines(filePath, terms);

    return this.builder.build(lines, matchedLines, documentId, terms, question);
  }
}
