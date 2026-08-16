import { LlmService } from "../../../src/services/llm/llm-service.js";
import type { AbstractLanguageModel } from "../../../src/contracts/services/llm/abstract-language-model.js";
import type { Passage } from "../../../src/types/services/retrieval/document-retriever.js";

/** A stub model returning canned replies, so the checks around the model can be tested without calling one. */
function stubModel(...replies: string[]): AbstractLanguageModel {
  const queue = [...replies];

  return {
    complete: jest.fn(async () => queue.shift() ?? "{}"),
  } as unknown as AbstractLanguageModel;
}

const passage = (text: string): Passage => ({ id: "doc:1-10", pageNumbers: [1], text });
// One passage of prose. Note "A battery that" and "holds less" sit on separate lines, as they would after a
// real PDF is extracted.
const passages = [
  passage(
    "The battery is covered for 12 months only. A battery that\nholds less than 80 percent of its rated capacity within\nthat period is replaced free of charge.",
  ),
];

describe("LlmService.answerFromPassages", () => {
  it("returns the refusal message when retrieval found nothing, without calling the model", async () => {
    const model = stubModel();
    const service = new LlmService(model);

    expect(await service.answerFromPassages("anything", [])).toBe(LlmService.noAnswerMessage);
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("returns the answer when the model supports it and quotes the passage", async () => {
    const service = new LlmService(
      stubModel(
        JSON.stringify({
          supported: true,
          answer: "The battery is covered for 12 months.",
          evidence: ["The battery is covered for 12 months only"],
        }),
      ),
    );

    expect(await service.answerFromPassages("how long is the battery covered", passages)).toBe(
      "The battery is covered for 12 months.",
    );
  });

  it("accepts a quote that spans a line break in the passage", async () => {
    // The model writes the sentence on one line; the document wraps it. Comparing the raw text would fail here,
    // which used to throw away correct answers.
    const service = new LlmService(
      stubModel(
        JSON.stringify({
          supported: true,
          answer: "A battery below 80 percent of rated capacity is replaced.",
          evidence: ["A battery that holds less than 80 percent of its rated capacity"],
        }),
      ),
    );

    expect(await service.answerFromPassages("when is a battery replaced", passages)).toBe(
      "A battery below 80 percent of rated capacity is replaced.",
    );
  });

  it("refuses when the model marks the answer unsupported", async () => {
    const service = new LlmService(
      stubModel(JSON.stringify({ supported: false, answer: "anything at all", evidence: ["the battery is covered"] })),
    );

    expect(await service.answerFromPassages("how long do batteries last", passages)).toBe(LlmService.noAnswerMessage);
  });

  it("refuses when the quoted evidence is not in the passage", async () => {
    const service = new LlmService(
      stubModel(
        JSON.stringify({
          supported: true,
          answer: "The battery is covered for 5 years.",
          evidence: ["the battery is covered for 5 years"],
        }),
      ),
    );

    expect(await service.answerFromPassages("how long is the battery covered", passages)).toBe(
      LlmService.noAnswerMessage,
    );
  });

  it("refuses a one word quote, which the search guarantees is present anyway", async () => {
    const service = new LlmService(
      stubModel(JSON.stringify({ supported: true, answer: "Batteries last five years.", evidence: ["battery"] })),
    );

    expect(await service.answerFromPassages("how long do batteries last", passages)).toBe(LlmService.noAnswerMessage);
  });

  it("accepts a two word quote, because a table row is a complete quote that short", async () => {
    const rows = [passage("Warranty terms by model\nA100 12 months\nA300 24 months")];
    const service = new LlmService(
      stubModel(
        JSON.stringify({
          supported: true,
          answer: "The A300 is covered for 24 months.",
          evidence: ["A300 24 months"],
        }),
      ),
    );

    expect(await service.answerFromPassages("what is the warranty on the A300", rows)).toBe(
      "The A300 is covered for 24 months.",
    );
  });

  it("refuses when the answer is mostly words that are not in the passage", async () => {
    // A real quote does not license invented prose beside it: this cites the passage correctly but answers
    // from outside knowledge.
    const service = new LlmService(
      stubModel(
        JSON.stringify({
          supported: true,
          answer: "Lithium cells typically degrade after roughly 500 charge cycles under warm conditions.",
          evidence: ["The battery is covered for 12 months only"],
        }),
      ),
    );

    expect(await service.answerFromPassages("why do batteries degrade", passages)).toBe(LlmService.noAnswerMessage);
  });

  it("refuses when the model does not return valid JSON", async () => {
    const service = new LlmService(stubModel("I think the battery lasts a year."));

    expect(await service.answerFromPassages("how long is the battery covered", passages)).toBe(
      LlmService.noAnswerMessage,
    );
  });

  it("reads an answer wrapped in a markdown code fence", async () => {
    const service = new LlmService(
      stubModel(
        '```json\n{"supported":true,"answer":"Covered for 12 months.","evidence":["The battery is covered for 12 months only"]}\n```',
      ),
    );

    expect(await service.answerFromPassages("how long is the battery covered", passages)).toBe(
      "Covered for 12 months.",
    );
  });
});

describe("LlmService.selectRelevant", () => {
  const two = [passage("The battery is covered for 12 months."), passage("Returns are accepted within 30 days.")];

  it("keeps everything when there is only one passage, so it can never silence an answerable question", async () => {
    const model = stubModel();
    const service = new LlmService(model);
    const one = [passage("The battery is covered for 12 months.")];

    expect(await service.selectRelevant("battery cover", one)).toEqual(one);
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("drops the passages the model did not choose", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ relevant: [1] })));

    expect(await service.selectRelevant("battery cover", two)).toEqual([two[0]]);
  });

  it("keeps the top ranked passage when the model rejects them all", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ relevant: [] })));

    expect(await service.selectRelevant("battery cover", two)).toEqual([two[0]]);
  });

  it("keeps everything when the model reply cannot be read", async () => {
    const service = new LlmService(stubModel("not json"));

    expect(await service.selectRelevant("battery cover", two)).toEqual(two);
  });
});

describe("LlmService.classifyGreetingsAndRespond", () => {
  it("reports a greeting with its reply", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ isGreeting: true, response: "Hello!" })));

    expect(await service.classifyGreetingsAndRespond("hi")).toEqual({ isGreeting: true, response: "Hello!" });
  });

  it("reports a document question", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ isGreeting: false, response: "" })));

    expect(await service.classifyGreetingsAndRespond("what is the warranty")).toEqual({
      isGreeting: false,
      response: "",
    });
  });

  it("gives up rather than guessing when the reply is unusable", async () => {
    const service = new LlmService(stubModel("{}"));

    expect(await service.classifyGreetingsAndRespond("hi")).toBeUndefined();
  });

  it("gives up when a greeting has no reply text to send", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ isGreeting: true, response: "   " })));

    expect(await service.classifyGreetingsAndRespond("hi")).toBeUndefined();
  });
});

describe("LlmService.correctSpelling", () => {
  it("uses the corrected question", async () => {
    const service = new LlmService(stubModel(JSON.stringify({ question: "what is the warranty" })));

    expect(await service.correctSpelling("waht is teh warrenty")).toBe("what is the warranty");
  });

  it("falls back to the original question when the model fails", async () => {
    const service = new LlmService(stubModel("nonsense"));

    expect(await service.correctSpelling("waht is teh warrenty")).toBe("waht is teh warrenty");
  });
});

describe("LlmService.expandQuery", () => {
  it("returns the terms the model produced", async () => {
    const service = new LlmService(
      stubModel(JSON.stringify({ exactTerms: ["battery"], keywords: ["warranty"], technicalTerms: [], phrases: [] })),
    );

    expect(await service.expandQuery("battery warranty")).toEqual({
      exactTerms: ["battery"],
      keywords: ["warranty"],
      technicalTerms: [],
      phrases: [],
    });
  });

  it("falls back to the question's own words when the model fails, rather than searching for nothing", async () => {
    const service = new LlmService(stubModel("not json"));

    expect((await service.expandQuery("battery warranty")).keywords).toEqual(["battery", "warranty"]);
  });
});
