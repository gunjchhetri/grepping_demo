import pdfParse from "pdf-parse";

/** Document service that converts PDF bytes into page-marked searchable text. */
export class PdfTextExtractor {
  private static readonly pageSeparator = "\f";

  public async extract(pdfBytes: Uint8Array): Promise<string> {
    const result = await pdfParse(Buffer.from(pdfBytes), {
      pagerender: async (page: {
        getTextContent: (options: {
          normalizeWhitespace: boolean;
          disableCombineTextItems: boolean;
        }) => Promise<{ items: Array<{ str: string }> }>;
      }) => {
        const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });

        return PdfTextExtractor.pageSeparator + content.items.map((item) => item.str).join(" ");
      },
    });

    return result.text
      .split(PdfTextExtractor.pageSeparator)
      .map((page) => page.trim())
      .filter(Boolean)
      .map((page, index) => `=== PAGE ${index + 1} ===\n${page}`)
      .join("\n\n");
  }
}
