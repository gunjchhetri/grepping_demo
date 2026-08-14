import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { AppConfig } from "../../config.js";
import { type ApiResponse, HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";
import { LlmService } from "../../services/llm/llm-service.js";
import { DocumentRetriever } from "../../services/retrieval/document-retriever.js";
import { MountedDocuments } from "../../services/storage/mounted-documents.js";
import { S3Keys } from "../../utils/s3/s3-keys.js";
import { S3Store } from "../../services/storage/s3-store.js";
import type { QuestionAnswer, QuestionRequest } from "../../types/question.js";

type Route = (event: APIGatewayProxyEventV2, userId: string) => Promise<ApiResponse>;

/**
 * POST /question runs retrieval inline and queues the model call.
 * GET /question/{jobId} reports the answer once the worker has written it.
 */
export class QuestionHandler {
  private readonly jobs = new S3Store(AppConfig.jobsBucket());
  private readonly mount = new MountedDocuments();
  private readonly retriever = new DocumentRetriever(new LlmService(AppConfig.llmProvider(), AppConfig.llmModel()));
  private readonly logger = new Logger({ serviceName: "question-api" });
  private readonly request = new RequestParser();
  private readonly response = new HttpResponse();

  private readonly routes: Record<string, Route> = {
    POST: (event, userId) => this.ask(event, userId),
    GET: (event, userId) => this.status(event, userId),
  };

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    try {
      const route = this.routes[event.requestContext.http.method];

      if (!route) {
        return this.response.error(405, "Only GET and POST are supported");
      }

      // Awaited so a rejection is caught here and answered as a 400.
      return await route(event, this.request.userId(event.headers));
    } catch (cause: unknown) {
      return this.response.error(400, cause instanceof Error ? cause.message : "Unable to process question");
    }
  }

  private async ask(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const body = this.request.body<{ documentId?: string; question?: string }>(event.body);
    const documentId = this.request.requireString(body.documentId, "documentId");
    const question = this.request.requireString(body.question, "question");
    const jobId = `question-${randomUUID()}`;

    this.logger.appendKeys({ correlationId: event.requestContext.requestId, documentId, jobId });

    const filePath = this.mount.requirePath(S3Keys.extractedText(userId, documentId));
    const passages = await this.retriever.retrieve(filePath, documentId, question);
    const queued: QuestionRequest = {
      jobId,
      userId,
      documentId,
      question,
      passages,
      createdAt: new Date().toISOString(),
    };

    await this.jobs.putJson(S3Keys.questionRequest(userId, jobId), queued);
    this.logger.info("Question queued", { passages: passages.length });

    return this.response.json(202, { jobId });
  }

  private async status(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const jobId = this.request.requireString(event.pathParameters?.jobId, "jobId");
    const answer = await this.jobs.readJson<QuestionAnswer>(S3Keys.questionAnswer(userId, jobId));

    if (answer) {
      return this.response.json(200, answer);
    }

    // No answer object yet. Distinguish "still working" from "never existed".
    return (await this.jobs.exists(S3Keys.questionRequest(userId, jobId)))
      ? this.response.json(202, { jobId, status: "PROCESSING" })
      : this.response.error(404, "Question not found");
  }
}

let instance: QuestionHandler | undefined;

export const handler = (event: APIGatewayProxyEventV2) => (instance ??= new QuestionHandler()).handle(event);
