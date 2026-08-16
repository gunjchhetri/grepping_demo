import { QuestionService } from "../../../src/services/questions/question-service.js";
import type { LlmService } from "../../../src/services/llm/llm-service.js";
import type { DocumentRetriever } from "../../../src/services/retrieval/document-retriever.js";

const passages = [{ id: "doc:1-10", pageNumbers: [1], text: "The battery is covered for 12 months." }];

function build(overrides: Partial<Record<keyof LlmService, unknown>> = {}) {
  const llm = {
    classifyGreetingsAndRespond: jest.fn(async () => ({ isGreeting: false, response: "" })),
    correctSpelling: jest.fn(async (question: string) => question),
    answerFromPassages: jest.fn(async () => "The battery is covered for 12 months."),
    ...overrides,
  } as unknown as LlmService;
  const retriever = { retrieve: jest.fn(async () => passages) } as unknown as DocumentRetriever;

  return { service: new QuestionService(retriever, llm), llm, retriever };
}

describe("QuestionService.answer", () => {
  it("replies to a greeting without reading the document", async () => {
    const { service, retriever, llm } = build({
      classifyGreetingsAndRespond: jest.fn(async () => ({ isGreeting: true, response: "Hello!" })),
    });

    expect(await service.answer("user", "", "hi there")).toBe("Hello!");
    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(llm.correctSpelling).not.toHaveBeenCalled();
  });

  it("refuses a document question that arrived without a document", async () => {
    const { service } = build();

    await expect(service.answer("user", "", "what is the warranty")).rejects.toThrow(/documentId is required/);
  });

  it("answers a document question from the passages that were found", async () => {
    const { service, llm } = build();

    expect(await service.answer("user", "doc-1", "what is the warranty")).toBe("The battery is covered for 12 months.");
    expect(llm.answerFromPassages).toHaveBeenCalledWith("what is the warranty", passages);
  });

  it("searches with the corrected question rather than the typed one", async () => {
    const { service, retriever } = build({
      correctSpelling: jest.fn(async () => "what is the warranty"),
    });

    await service.answer("user", "doc-1", "waht is teh warrenty");

    expect(retriever.retrieve).toHaveBeenCalledWith(expect.any(String), "doc-1", "what is the warranty");
  });

  it("looks for the document under the asking user, so one user cannot read another's file", async () => {
    const { service, retriever } = build();

    await service.answer("user-a", "doc-1", "what is the warranty");

    expect(retriever.retrieve).toHaveBeenCalledWith(expect.stringContaining("user-a"), "doc-1", expect.any(String));
  });

  it("reuses a classification it was given instead of asking the model twice", async () => {
    const { service, llm } = build();

    await service.answer("user", "doc-1", "what is the warranty", { isGreeting: false, response: "" });

    expect(llm.classifyGreetingsAndRespond).not.toHaveBeenCalled();
  });

  it("treats an unusable classification as a document question", async () => {
    const { service, retriever } = build({ classifyGreetingsAndRespond: jest.fn(async () => undefined) });

    await service.answer("user", "doc-1", "what is the warranty");

    expect(retriever.retrieve).toHaveBeenCalled();
  });
});
