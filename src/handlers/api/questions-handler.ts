import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { AppConstants } from "../../constants/app-constants.js";
import type { ApiResponse, QuestionRequest, RetrievalDebug } from "../../types/domain.js";
import { AppConfig } from "../../utils/app-config.js";
import { LlmService } from "../../services/llm/llm-service.js";
import { DocumentService } from "../../services/documents/document-service.js";
import { S3Storage } from "../../services/storage/s3-storage.js";
import { MountedFileStorage } from "../../services/storage/mounted-file-storage.js";
import { TextSearchService } from "../../services/text/text-search-service.js";
import { HttpResponse, IdGenerator, S3KeyBuilder, UserIdentity, Validation } from "../../utils/core-utils.js";

/** Owns the synchronous API boundary for asking questions and polling answers. */
export class QuestionsHandler {
  private readonly documents = new DocumentService(new MountedFileStorage());
  private readonly jobs = new S3Storage(AppConfig.jobsBucket());
  private readonly llm = new LlmService(AppConfig.llmProvider(), AppConfig.llmModel());
  private readonly text = new TextSearchService();
  private readonly ids = new IdGenerator();
  private readonly keys = new S3KeyBuilder();
  private readonly identity = new UserIdentity();
  private readonly response = new HttpResponse();
  private readonly validation = new Validation();
  private readonly logger = new Logger({ serviceName: "questions-api" });

  /** Routes question submission and question-status requests. */
  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse<unknown>> {
    try {
      // Awaited so a rejection lands in this catch instead of escaping as a 500.
      if (event.requestContext.http.method === "GET") {
        return await this.status(event);
      }

      if (event.requestContext.http.method === "POST") {
        return await this.ask(event);
      }

      return this.response.error(405, "Only GET and POST are supported");
    } catch (error: unknown) {
      return this.response.error(400, error instanceof Error ? error.message : "Unable to process question");
    }
  }

  private async ask(event: APIGatewayProxyEventV2): Promise<ApiResponse<unknown>> {
    const correlationId = event.requestContext.requestId;

    this.logger.appendKeys({ correlationId });

    const userId = this.identity.fromHeaders(event.headers);
    const { documentId, question } = this.validation.parseJson<{ documentId: string; question: string }>(
      event.body ?? "{}",
      "body",
    );
    let terms = await this.llm.expand(question);
    const filePath = await this.documents.extractedTextPath(userId, documentId);
    let result = await this.text.search(filePath, documentId, question, terms);

    if (result.matches.length === 0) {
      terms = await this.llm.expand(question, true);
      result = await this.text.search(filePath, documentId, question, terms);
    }

    const jobId = this.ids.create(AppConstants.questionIdPrefix);

    this.logger.appendKeys({ documentId, jobId });

    const debug: RetrievalDebug = { question, queryTerms: terms, ...result, selectedPassages: [] };
    const request: QuestionRequest = {
      jobId,
      correlationId,
      userId,
      documentId,
      question,
      candidates: result.candidates,
      retrievalDebug: debug,
      createdAt: new Date().toISOString(),
    };

    await this.jobs.putJson(this.keys.requestKey(userId, jobId), request);

    this.logger.info("Question request queued");

    return this.response.json(202, { jobId, correlationId, debug });
  }

  private async status(event: APIGatewayProxyEventV2): Promise<ApiResponse<unknown>> {
    const userId = this.identity.fromHeaders(event.headers);
    const id = event.pathParameters?.jobId;

    if (!id) {
      return this.response.error(400, "question id is required");
    }

    const request = await this.jobs.getJsonIfPresent<QuestionRequest>(this.keys.requestKey(userId, id));

    if (!request) {
      return this.response.error(404, "Question not found");
    }

    const answer = await this.jobs.getJsonIfPresent(this.keys.responseKey(userId, id));

    if (answer) {
      return this.response.json(200, answer);
    }

    return this.response.json(202, { jobId: id, status: "PROCESSING", retrievalDebug: request.retrievalDebug });
  }
}
