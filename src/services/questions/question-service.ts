import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { LlmService } from "../llm/llm-service.js";
import type { DocumentRetriever } from "../retrieval/document-retriever.js";

/** Routes conversational messages directly to the LLM and document questions through retrieval. */
export class QuestionService {
  public constructor(
    private readonly retriever: DocumentRetriever,
    private readonly llm: LlmService,
  ) {}

  public isConversational(question: string): boolean {
    return this.llm.isConversational(question);
  }

  public async *answer(userId: string, documentId: string, question: string): AsyncIterable<string> {
    if (this.llm.isConversational(question)) {
      yield* this.llm.streamConversational(question);

      return;
    }

    const passages = await this.retriever.retrieve(S3Keys.extractedText(userId, documentId), documentId, question);

    yield* this.llm.streamAnswer(question, passages);
  }
}
