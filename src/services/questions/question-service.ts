import { S3Keys } from "../../utils/s3/s3-keys.js";
import type { LlmService } from "../llm/llm-service.js";
import type { DocumentRetriever } from "../retrieval/document-retriever.js";

/** Question business service for retrieval and streamed evidence-backed answers. */
export class QuestionService {
  public constructor(
    private readonly retriever: DocumentRetriever,
    private readonly llm: LlmService,
  ) {}

  public async *answer(userId: string, documentId: string, question: string): AsyncIterable<string> {
    const passages = await this.retriever.retrieve(S3Keys.extractedText(userId, documentId), documentId, question);

    yield* this.llm.streamAnswer(question, passages);
  }
}
