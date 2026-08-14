import pdfParse from "pdf-parse";

/** Converts a PDF into plain text with page markers ripgrep results can be traced back to. */
export class PdfTextService {
  // pdf-parse joins page output with "\n\n", which also occurs inside a page, so page
  // boundaries cannot be recovered afterwards. Each page is prefixed with a maullay feed
  // '/f" at the beginning so we can identify page number later. We use pagenumbers to tell user where we got answers.
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

        return PdfTextService.pageSeparator + content.items.map((item) => item.str).join(" ");
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
