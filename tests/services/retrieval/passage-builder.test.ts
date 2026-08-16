import { PassageBuilder } from "../../../src/services/retrieval/passage-builder.js";
import type { QueryTerms } from "../../../src/types/services/retrieval/document-retriever.js";

const terms: QueryTerms = { exactTerms: ["battery"], keywords: ["warranty"], technicalTerms: [], phrases: [] };
/** A document long enough that matches can be far enough apart to stay separate. */
const lines = Array.from({ length: 120 }, (_, index) => `line ${index + 1} battery warranty text`);

describe("PassageBuilder.build", () => {
  const builder = new PassageBuilder();

  it("returns nothing when the search matched nothing", () => {
    expect(builder.build(lines, [], "doc", terms, "battery")).toEqual([]);
  });

  it("merges matches that are close together into one passage", () => {
    const passages = builder.build(lines, [30, 34], "doc", terms, "battery");

    expect(passages).toHaveLength(1);
  });

  it("keeps matches that are far apart as separate passages", () => {
    const passages = builder.build(lines, [10, 100], "doc", terms, "battery");

    expect(passages).toHaveLength(2);
  });

  it("includes the lines around a match, not just the matching line", () => {
    const [passage] = builder.build(lines, [50], "doc", terms, "battery");

    expect(passage.text).toContain("line 50 ");
    expect(passage.text).toContain("line 45 ");
    expect(passage.text).toContain("line 55 ");
  });

  it("does not run off either end of the document", () => {
    const [first] = builder.build(lines, [1], "doc", terms, "battery");
    const [last] = builder.build(lines, [120], "doc", terms, "battery");

    expect(first.text).toContain("line 1 ");
    expect(last.text).toContain("line 120 ");
  });

  it("keeps at most eight passages so the model is not sent the whole document", () => {
    const spread = [5, 25, 45, 65, 85, 105, 125, 145, 165, 185, 205];
    const many = Array.from({ length: 220 }, (_, index) => `line ${index + 1} battery`);

    expect(builder.build(many, spread, "doc", terms, "battery").length).toBeLessThanOrEqual(8);
  });

  it("returns the strongest passage first", () => {
    const weighted = [...lines];

    weighted[99] = "battery battery battery battery warranty warranty";

    const passages = builder.build(weighted, [10, 100], "doc", terms, "battery");

    expect(passages[0].score).toBeGreaterThanOrEqual(passages[1].score);
  });

  it("reports the page a passage came from", () => {
    const paged = ["=== PAGE 1 ===", "battery text", "=== PAGE 2 ===", "warranty text"];

    expect(builder.build(paged, [4], "doc", terms, "warranty")[0].pageNumbers).toContain(2);
  });

  it("identifies the passage by document and line range", () => {
    const [passage] = builder.build(lines, [50], "doc-abc", terms, "battery");

    expect(passage.id).toMatch(/^doc-abc:\d+-\d+$/);
  });
});
