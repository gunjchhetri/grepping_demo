import { ModelOutputParser } from "../../../src/utils/llm/model-output-parser.js";

describe("ModelOutputParser.parseJson", () => {
  const parser = new ModelOutputParser();

  it("reads plain JSON", () => {
    expect(parser.parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads JSON wrapped in a markdown code fence, which models add unprompted", () => {
    expect(parser.parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parser.parseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("throws on text that is not JSON, so the caller can fall back", () => {
    expect(() => parser.parseJson("I think the answer is 12 months")).toThrow();
  });
});

describe("ModelOutputParser.toSupportedAnswer", () => {
  const parser = new ModelOutputParser();

  it("reads a complete answer", () => {
    expect(parser.toSupportedAnswer({ supported: true, answer: "Yes.", evidence: ["quote"] })).toEqual({
      supported: true,
      answer: "Yes.",
      evidence: ["quote"],
    });
  });

  it("rejects an answer with no text", () => {
    expect(parser.toSupportedAnswer({ supported: true, answer: "   ", evidence: ["quote"] })).toBeUndefined();
  });

  it("rejects a reply missing the supported flag", () => {
    expect(parser.toSupportedAnswer({ answer: "Yes.", evidence: ["quote"] })).toBeUndefined();
  });

  it("rejects anything that is not an object", () => {
    expect(parser.toSupportedAnswer("nope")).toBeUndefined();
    expect(parser.toSupportedAnswer(null)).toBeUndefined();
    expect(parser.toSupportedAnswer([1, 2])).toBeUndefined();
  });

  it("discards blank and non-string evidence entries", () => {
    const answer = parser.toSupportedAnswer({ supported: true, answer: "Yes.", evidence: ["real", "", "  ", 7] });

    expect(answer?.evidence).toEqual(["real"]);
  });

  it("de-duplicates repeated evidence", () => {
    const answer = parser.toSupportedAnswer({ supported: true, answer: "Yes.", evidence: ["same", "same"] });

    expect(answer?.evidence).toEqual(["same"]);
  });
});

describe("ModelOutputParser.toQueryTerms", () => {
  const parser = new ModelOutputParser();

  it("reads all four kinds of term", () => {
    expect(
      parser.toQueryTerms({
        exactTerms: ["a"],
        keywords: ["b"],
        technicalTerms: ["c"],
        phrases: ["d"],
      }),
    ).toEqual({ exactTerms: ["a"], keywords: ["b"], technicalTerms: ["c"], phrases: ["d"] });
  });

  it("returns empty lists rather than failing on a malformed reply", () => {
    expect(parser.toQueryTerms("nonsense")).toEqual({
      exactTerms: [],
      keywords: [],
      technicalTerms: [],
      phrases: [],
    });
  });
});

describe("ModelOutputParser.fallbackTerms", () => {
  const parser = new ModelOutputParser();

  it("uses the question's own words when the model cannot be reached", () => {
    expect(parser.fallbackTerms("What is the battery warranty?").keywords).toEqual(["battery", "warranty"]);
  });

  it("leaves out words too common to be worth searching for", () => {
    expect(parser.fallbackTerms("what is the and for").keywords).toEqual([]);
  });
});
