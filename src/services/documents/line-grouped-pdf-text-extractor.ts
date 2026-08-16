import pdfParse from "pdf-parse";
import { AbstractPdfTextExtractor } from "../../contracts/services/documents/abstract-pdf-text-extractor.js";

/** Converts PDF bytes into page-marked text, keeping the lines the PDF actually printed. */
export class LineGroupedPdfTextExtractor extends AbstractPdfTextExtractor {
  private static readonly pageSeparator = "\f";

  public async extract(pdfBytes: Uint8Array): Promise<string> {
    const result = await pdfParse(Buffer.from(pdfBytes), {
      pagerender: async (page: {
        getTextContent: (options: {
          normalizeWhitespace: boolean;
          disableCombineTextItems: boolean;
        }) => Promise<{ items: Array<{ str: string; transform?: number[] }> }>;
      }) => {
        const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });

        return LineGroupedPdfTextExtractor.pageSeparator + LineGroupedPdfTextExtractor.toLines(content.items);
      },
    });

    return result.text
      .split(LineGroupedPdfTextExtractor.pageSeparator)
      .map((page) => page.trim())
      .filter(Boolean)
      .map((page, index) => `=== PAGE ${index + 1} ===\n${page}`)
      .join("\n\n");
  }

  /**
   * A PDF stores text as small positioned pieces rather than lines, so pieces printed at the same height are
   * grouped back into one line. Each piece carries a `transform` array, where index 5 is its y position (its
   * height up the page) and index 4 is its x position (how far across).
   *
   * Given three pieces from a price table:
   *
   *     { str: "A300",  transform: [..., x: 72,  y: 400] }
   *     { str: "1 TB",  transform: [..., x: 300, y: 400] }
   *     { str: "A200",  transform: [..., x: 72,  y: 420] }
   *
   * the two at y=400 are the same printed row, so they join in x order into "A300 1 TB". The piece at y=420
   * sits higher on the page, so it becomes its own line above it. Sorting y high-to-low reads the page
   * top-to-bottom, giving:
   *
   *     A200
   *     A300 1 TB
   *
   * Simply joining every piece with a space instead would produce "A300 1 TB A200" as one line, and a whole
   * page would arrive as a single line of text.
   */
  private static toLines(items: Array<{ str: string; transform?: number[] }>): string {
    const rows = new Map<number, Array<{ x: number; str: string }>>();

    for (const item of items) {
      const y = Math.round(item.transform?.[5] ?? 0);

      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform?.[4] ?? 0, str: item.str }]);
    }

    return [...rows.entries()]
      .sort(([topY], [nextY]) => nextY - topY)
      .map(([, parts]) =>
        parts
          .sort((left, right) => left.x - right.x)
          .map((part) => part.str)
          .join(" ")
          // Column padding inside a line carries no meaning once the line breaks are real newlines, and it is
          // paid for on every LLM call, so collapse it. Only the newlines are load-bearing.
          .replace(/[ \t]+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
  }
}
