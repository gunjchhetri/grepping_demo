import { DocumentRetriever } from "../../../src/services/retrieval/document-retriever.js";
import type { MountedDocumentStore } from "../../../src/infrastructure/filesystem/mounted-document-store.js";
import type { RipgrepTextSearch } from "../../../src/infrastructure/retrieval/ripgrep-text-search.js";
import type { LlmService } from "../../../src/services/llm/llm-service.js";
import type { PassageBuilder } from "../../../src/services/retrieval/passage-builder.js";
import type { ScoredPassage } from "../../../src/types/services/retrieval/document-retriever.js";

const terms = { exactTerms: ["battery"], keywords: [], technicalTerms: [], phrases: [] };
const found: ScoredPassage[] = [{ id: "doc:1-10", pageNumbers: [1], text: "battery text", score: 5 }];

function build({ precise, broader }: { precise: ScoredPassage[]; broader: ScoredPassage[] }) {
  const files = {
    requirePath: jest.fn(() => "/mnt/documents/doc.txt"),
    readText: jest.fn(async () => "battery text\nmore text"),
  } as unknown as MountedDocumentStore;
  const llm = {
    expandQuery: jest.fn(async () => terms),
    selectRelevant: jest.fn(async (_question: string, passages: unknown[]) => passages),
  } as unknown as LlmService;
  const search = { matchingLines: jest.fn(async () => [1]) } as unknown as RipgrepTextSearch;
  const builder = {
    build: jest.fn().mockReturnValueOnce(precise).mockReturnValueOnce(broader),
  } as unknown as PassageBuilder;

  return { retriever: new DocumentRetriever(files, llm, search, builder), llm, search, files, builder };
}

describe("DocumentRetriever.retrieve", () => {
  it("searches once when the precise terms match something", async () => {
    const { retriever, llm } = build({ precise: found, broader: [] });

    await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery warranty");

    expect(llm.expandQuery).toHaveBeenCalledTimes(1);
    expect(llm.expandQuery).toHaveBeenCalledWith("battery warranty", false);
  });

  it("retries with broader terms when the precise pass matched nothing", async () => {
    const { retriever, llm } = build({ precise: [], broader: found });

    await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery warranty");

    expect(llm.expandQuery).toHaveBeenCalledTimes(2);
    expect(llm.expandQuery).toHaveBeenNthCalledWith(2, "battery warranty", true);
  });

  it("returns nothing when even the broader retry found nothing", async () => {
    const { retriever } = build({ precise: [], broader: [] });

    expect(await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery")).toEqual([]);
  });

  it("passes the results through the relevance filter", async () => {
    const { retriever, llm } = build({ precise: found, broader: [] });

    await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery warranty");

    expect(llm.selectRelevant).toHaveBeenCalledWith("battery warranty", [
      { id: "doc:1-10", pageNumbers: [1], text: "battery text" },
    ]);
  });

  it("does not leak the internal score to the caller", async () => {
    const { retriever } = build({ precise: found, broader: [] });
    const passages = await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery");

    expect(passages[0]).not.toHaveProperty("score");
  });

  it("reads the document through the mounted file system", async () => {
    const { retriever, files, search } = build({ precise: found, broader: [] });

    await retriever.retrieve("documents/user/doc/document.txt", "doc", "battery");

    expect(files.requirePath).toHaveBeenCalledWith("documents/user/doc/document.txt");
    expect(search.matchingLines).toHaveBeenCalledWith("/mnt/documents/doc.txt", terms);
  });
});
