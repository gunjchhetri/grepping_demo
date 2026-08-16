import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { GreetingClassification, LlmService } from "../llm/llm-service.js";
import type { DocumentRetriever } from "../retrieval/document-retriever.js";

/** Classifies messages first, then routes greetings directly or document questions through retrieval. */
export class QuestionService {
  public constructor(
    private readonly retriever: DocumentRetriever,
    private readonly llm: LlmService,
  ) {}

  public classifyGreetingsAndRespond(question: string): Promise<GreetingClassification | undefined> {
    return this.llm.classifyGreetingsAndRespond(question);
  }

  public async *answer(
    userId: string,
    documentId: string,
    question: string,
    classification?: GreetingClassification,
  ): AsyncIterable<string> {
    const greeting = classification ?? (await this.llm.classifyGreetingsAndRespond(question));

    if (greeting?.isGreeting) {
      yield greeting.response;

      return;
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

    yield* this.llm.streamAnswer(correctedQuestion, passages);
  }
}
