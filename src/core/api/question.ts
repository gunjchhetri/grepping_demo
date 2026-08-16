import { Logger } from "@aws-lambda-powertools/logger";
import type { APIGatewayProxyEvent } from "aws-lambda";
import type { QuestionRequestBody } from "../../types/core/api/question.js";
import { QuestionService } from "../../services/questions/question-service.js";
import { HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";

/** Validates a question request and streams the evidence-backed answer to API Gateway. */
export class QuestionApi {
  private readonly logger = new Logger({ serviceName: "question-api" });

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
      const classification = await this.questions.classifyGreetingsAndRespond(question);

      if (!documentId && !classification?.isGreeting) {
        this.response.streamError(responseStream, 400, "documentId is required for document questions");

        return;
      }

      const stream = this.response.stream(responseStream);

      try {
        // The wrapped response stream ignores a payload passed to end(), so the body must be written first.
        stream.write(await this.questions.answer(userId, documentId, question, classification));
        stream.end();
      } catch (cause: unknown) {
        // Logged as well as returned: the caller only ever sees this text appended to a 200 response, so
        // without a log line the underlying failure leaves no trace anywhere.
        this.logger.error("Answering the question failed", { error: cause });

        stream.end(`\n\n${cause instanceof Error ? cause.message : "Unable to answer question"}`);
      }
    } catch (cause: unknown) {
      this.logger.error("The question request failed", { error: cause });

      this.response.streamError(
        responseStream,
        400,
        cause instanceof Error ? cause.message : "Unable to process question",
      );
    }
  }
}
