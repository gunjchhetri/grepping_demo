import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { GreetingClassification, LlmService } from "../llm/llm-service.js";
import type { DocumentRetriever } from "../retrieval/document-retriever.js";

/** Classifies messages first, then routes greetings directly or document questions through retrieval. */
export class QuestionService {
  public constructor(
    private readonly retriever: DocumentRetriever,
    private readonly llm: LlmService,
  ) {}

  /**
   * Decides whether a message is small talk or a real question about the document. The caller does this before
   * {@link answer} so it can reject a document question that arrived without a document, and passes the result
   * back in to avoid asking the model the same thing twice.
   */
  public classifyGreetingsAndRespond(question: string): Promise<GreetingClassification | undefined> {
    return this.llm.classifyGreetingsAndRespond(question);
  }

  /**
   * Produces the reply to one message, which is either a greeting response or an answer taken from the
   * document. Greetings never touch the document, so no file is read and nothing is searched for them.
   *
   * The reply is returned whole rather than in pieces. An answer cannot be shown until its supporting evidence
   * has been checked, and text already sent to a browser cannot be taken back, so there is nothing to hand out
   * before the complete answer exists.
   */
  public async answer(
    userId: string,
    documentId: string,
    question: string,
    classification?: GreetingClassification,
  ): Promise<string> {
    const greeting = classification ?? (await this.llm.classifyGreetingsAndRespond(question));

    if (greeting?.isGreeting) {
      return greeting.response;
    }

    if (!documentId) {
      throw new Error("documentId is required for document questions");
    }

    const correctedQuestion = await this.llm.correctSpelling(question);
    const passages = await this.retriever.retrieve(
      S3Keys.extractedText(userId, documentId),
      documentId,
      correctedQuestion,
    );

    return this.llm.answerFromPassages(correctedQuestion, passages);
  }
}
