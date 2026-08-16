import pdfParse from "pdf-parse";
import { LineGroupedPdfTextExtractor } from "../../../src/services/documents/line-grouped-pdf-text-extractor.js";

jest.mock("pdf-parse", () => jest.fn());

type Item = { str: string; transform?: number[] };

/** pdfjs positions each fragment with a transform array: index 4 is x, index 5 is y. */
const at = (x: number, y: number, str: string): Item => ({ str, transform: [1, 0, 0, 1, x, y] });

/**
 * Stands in for pdf-parse by handing the extractor's own pagerender the fragments for each page, so the real
 * grouping runs on controlled input and no PDF file is needed.
 */
function givePages(...pages: Item[][]) {
  (pdfParse as unknown as jest.Mock).mockImplementation(
    async (_bytes: Buffer, options: { pagerender: (page: unknown) => Promise<string> }) => {
      let text = "";

      for (const items of pages) {
        text += await options.pagerender({ getTextContent: async () => ({ items }) });
      }

      return { text };
    },
  );
}

const extract = () => new LineGroupedPdfTextExtractor().extract(new Uint8Array([1, 2, 3]));

describe("LineGroupedPdfTextExtractor", () => {
  it("joins fragments printed at the same height into one line", async () => {
    givePages([at(72, 400, "A300"), at(300, 400, "24 months")]);

    expect(await extract()).toContain("A300 24 months");
  });

  it("starts a new line for fragments at a different height", async () => {
    givePages([at(72, 420, "A200"), at(72, 400, "A300")]);

    expect((await extract()).split("\n")).toEqual(["=== PAGE 1 ===", "A200", "A300"]);
  });

  it("reads the page from top to bottom regardless of the order fragments arrive in", async () => {
    givePages([at(72, 300, "third"), at(72, 500, "first"), at(72, 400, "second")]);

    expect((await extract()).split("\n").slice(1)).toEqual(["first", "second", "third"]);
  });

  it("reads a line from left to right regardless of fragment order", async () => {
    givePages([at(300, 400, "world"), at(72, 400, "hello")]);

    expect(await extract()).toContain("hello world");
  });

  it("treats fragments a fraction of a point apart as the same line", async () => {
    givePages([at(72, 400.2, "same"), at(120, 399.8, "line")]);

    expect(await extract()).toContain("same line");
  });

  it("collapses the column padding a PDF leaves between words", async () => {
    givePages([at(72, 400, "Model"), at(300, 400, "     Price     ")]);

    expect(await extract()).not.toMatch(/ {2,}/);
  });

  it("marks each page and numbers them in order", async () => {
    givePages([at(72, 400, "first page")], [at(72, 400, "second page")]);

    const text = await extract();

    expect(text).toContain("=== PAGE 1 ===");
    expect(text).toContain("=== PAGE 2 ===");
    expect(text.indexOf("=== PAGE 1 ===")).toBeLessThan(text.indexOf("=== PAGE 2 ==="));
  });

  it("drops blank lines rather than emitting empty ones", async () => {
    givePages([at(72, 420, "text"), at(72, 400, "   "), at(72, 380, "more")]);

    expect((await extract()).split("\n")).toEqual(["=== PAGE 1 ===", "text", "more"]);
  });

  it("skips a page with no text at all", async () => {
    givePages([at(72, 400, "only page")], []);

    expect(await extract()).not.toContain("=== PAGE 2 ===");
  });

  it("survives fragments that carry no position", async () => {
    givePages([{ str: "no position" }]);

    expect(await extract()).toContain("no position");
  });
});
