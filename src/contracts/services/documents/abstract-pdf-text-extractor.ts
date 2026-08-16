/**
 * Abstract PDF-to-text contract used by document processing.
 *
  I wanted to maek this implementation swappable for this parser, Current one is bit complex which foloowx x,y cocooridnates
  system, but it presersves text posiiton in plain texts as well as the tebles etc. But if we want to use a simpler one, we can swap it out with this contract.
  
 */
export abstract class AbstractPdfTextExtractor {
  public abstract extract(pdfBytes: Uint8Array): Promise<string>;
}
