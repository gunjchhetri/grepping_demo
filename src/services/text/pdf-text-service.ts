import pdfParse from "pdf-parse";

/** Converts a PDF buffer into plain text while keeping page markers. */
export class PdfTextService {
  // pdf-parse concatenates page output with "\n\n", which also occurs inside a page,
  // so it cannot be used to recover page boundaries. Each page's rendered text is
  // instead prefixed with a form feed here and the text is split on that afterwards.
  private static readonly pageSeparator = "\f";

  /** Extracts searchable text from a PDF and adds page markers. */
  public async extract(pdfBytes: Uint8Array): Promise<string> {
    const result = await pdfParse(Buffer.from(pdfBytes), {
      pagerender: async (pageData: {
        getTextContent: (options: {
          normalizeWhitespace: boolean;
          disableCombineTextItems: boolean;
        }) => Promise<{ items: Array<{ str: string }> }>;
      }) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });

        return `${PdfTextService.pageSeparator}${content.items.map((item) => item.str).join(" ")}`;
      },
    });

    return result.text
      .split(PdfTextService.pageSeparator)
      .map((page) => page.trim())
      .filter(Boolean)
      .map((page, index) => `=== PAGE ${index + 1} ===\n${page}`)
      .join("\n\n");
  }
}
