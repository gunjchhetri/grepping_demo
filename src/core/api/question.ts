import type { APIGatewayProxyEvent } from "aws-lambda";
import type { QuestionRequestBody } from "../../types/core/api/question.js";
import { QuestionService } from "../../services/questions/question-service.js";
import { HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";

/** Validates a question request and streams the evidence-backed answer to API Gateway. */
export class QuestionApi {
  public constructor(
    private readonly questions: QuestionService,
    private readonly request: RequestParser,
    private readonly response: HttpResponse,
  ) {}

  public async handle(event: APIGatewayProxyEvent, responseStream: awslambda.HttpResponseStream): Promise<void> {
    try {
      if (event.httpMethod !== "POST") {
        this.response.streamError(responseStream, 405, "Only POST is supported");

        return;
      }

      const userId = this.request.userId(event.headers);
      const body = this.request.body<QuestionRequestBody>(event.body);
      const question = this.request.requireString(body.question, "question");
      const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";

      if (!documentId && !this.questions.isConversational(question)) {
        this.response.streamError(responseStream, 400, "documentId is required for document questions");

        return;
      }

      const stream = this.response.stream(responseStream);

      try {
        for await (const chunk of this.questions.answer(userId, documentId, question)) {
          stream.write(chunk);
        }

        stream.end();
      } catch (cause: unknown) {
        stream.end(`\n\n${cause instanceof Error ? cause.message : "Unable to answer question"}`);
      }
    } catch (cause: unknown) {
      this.response.streamError(
        responseStream,
        400,
        cause instanceof Error ? cause.message : "Unable to process question",
      );
    }
  }
}
