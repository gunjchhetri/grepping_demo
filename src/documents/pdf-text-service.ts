import pdfParse from "pdf-parse";

// pdf-parse joins page output with "\n\n", which also occurs inside a page, so page
// boundaries cannot be recovered afterwards. Each page is prefixed with a form feed
// as it renders, and the text is split on that.
const PAGE_SEPARATOR = "\f";

/** Converts a PDF into plain text with page markers ripgrep results can be traced back to. */
export class PdfTextService {
  public async extract(pdfBytes: Uint8Array): Promise<string> {
    const result = await pdfParse(Buffer.from(pdfBytes), {
      pagerender: async (page: {
        getTextContent: (options: {
          normalizeWhitespace: boolean;
          disableCombineTextItems: boolean;
        }) => Promise<{ items: Array<{ str: string }> }>;
      }) => {
        const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });

        return PAGE_SEPARATOR + content.items.map((item) => item.str).join(" ");
      },
    });

    return result.text
      .split(PAGE_SEPARATOR)
      .map((page) => page.trim())
      .filter(Boolean)
      .map((page, index) => `=== PAGE ${index + 1} ===\n${page}`)
      .join("\n\n");
  }
}
