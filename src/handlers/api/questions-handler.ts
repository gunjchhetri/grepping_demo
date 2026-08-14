import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { AppConfig } from "../../config.js";
import { type ApiResponse, error, json, parseBody, requireString } from "../../http/api-response.js";
import { LlmService } from "../../llm/llm-service.js";
import { DocumentRetriever } from "../../retrieval/document-retriever.js";
import { MountedDocuments } from "../../storage/mounted-documents.js";
import { S3Keys } from "../../storage/s3-keys.js";
import { S3Store } from "../../storage/s3-store.js";
import type { QuestionAnswer, QuestionRequest } from "../../types.js";
import { userIdFromHeaders } from "../../user-id.js";

/**
 * POST /questions runs retrieval inline and queues the model call.
 * GET /questions/{jobId} reports the answer once the worker has written it.
 */
export class QuestionsHandler {
  private readonly jobs = new S3Store(AppConfig.jobsBucket());
  private readonly mount = new MountedDocuments();
  private readonly retriever = new DocumentRetriever(new LlmService(AppConfig.llmProvider(), AppConfig.llmModel()));
  private readonly logger = new Logger({ serviceName: "questions-api" });

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    try {
      // Awaited so a rejection is caught here and answered as a 400.
      if (event.requestContext.http.method === "GET") {
        return await this.status(event);
      }

      if (event.requestContext.http.method === "POST") {
        return await this.ask(event);
      }

      return error(405, "Only GET and POST are supported");
    } catch (cause: unknown) {
      return error(400, cause instanceof Error ? cause.message : "Unable to process question");
    }
  }

  private async ask(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    const userId = userIdFromHeaders(event.headers);
    const body = parseBody<{ documentId?: string; question?: string }>(event.body);
    const documentId = requireString(body.documentId, "documentId");
    const question = requireString(body.question, "question");
    const jobId = `question-${randomUUID()}`;

    this.logger.appendKeys({ correlationId: event.requestContext.requestId, documentId, jobId });

    const filePath = this.mount.requirePath(S3Keys.extractedText(userId, documentId));
    const passages = await this.retriever.retrieve(filePath, documentId, question);
    const request: QuestionRequest = {
      jobId,
      userId,
      documentId,
      question,
      passages,
      createdAt: new Date().toISOString(),
    };

    await this.jobs.putJson(S3Keys.questionRequest(userId, jobId), request);
    this.logger.info("Question queued", { passages: passages.length });

    return json(202, { jobId });
  }

  private async status(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    const userId = userIdFromHeaders(event.headers);
    const jobId = requireString(event.pathParameters?.jobId, "jobId");
    const answer = await this.jobs.readJson<QuestionAnswer>(S3Keys.questionAnswer(userId, jobId));

    if (answer) {
      return json(200, answer);
    }

    // No answer object yet. Distinguish "still working" from "never existed".
    return (await this.jobs.exists(S3Keys.questionRequest(userId, jobId)))
      ? json(202, { jobId, status: "PROCESSING" })
      : error(404, "Question not found");
  }
}
