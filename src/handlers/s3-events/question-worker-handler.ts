import type { S3Event } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { AppConstants } from "../../constants/app-constants.js";
import { S3Storage } from "../../services/storage/s3-storage.js";
import { LlmService } from "../../services/llm/llm-service.js";
import type { QuestionRequest } from "../../types/domain.js";
import { S3KeyBuilder } from "../../utils/core-utils.js";
import { AppConfig } from "../../utils/app-config.js";

export class QuestionWorkerHandler {
  private readonly storage = new S3Storage(AppConfig.jobsBucket());
  private readonly llm = new LlmService(AppConfig.llmProvider(), AppConfig.llmModel());
  private readonly keys = new S3KeyBuilder();
  private readonly logger = new Logger({ serviceName: "question-worker" });

  /** Processes queued question requests and stores generated answers in S3. */
  public async handle(event: S3Event): Promise<void> {
    for (const record of event.Records) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      const parts = this.keys.parseRequestKey(key);

      if (!parts) {
        continue;
      }

      const { userId, jobId } = parts;
      const answerKey = this.keys.responseKey(userId, jobId);

      if (await this.storage.exists(answerKey)) {
        continue;
      }

      const request = await this.storage.getJsonIfPresent<QuestionRequest>(key);

      if (!request) {
        continue;
      }

      this.logger.appendKeys({
        correlationId: request.correlationId,
        documentId: request.documentId,
        jobId,
        userId,
      });

      try {
        const result = await this.llm.answer(request.question, request.candidates);

        await this.storage.putJson(answerKey, {
          jobId,
          status: "COMPLETED",
          answer: result.answer,
          selectedPassages: request.candidates.filter((candidate) => result.selectedIds.includes(candidate.id)),
          retrievalDebug: {
            ...request.retrievalDebug,
            selectedPassages: request.candidates.filter((candidate) => result.selectedIds.includes(candidate.id)),
          },
          completedAt: new Date().toISOString(),
        });

        this.logger.info("Question processing completed");
      } catch (error: unknown) {
        this.logger.error("Question processing failed", {
          error: error instanceof Error ? error.message : String(error),
        });

        // Keep the demo useful when Bedrock is unreachable from the VPC: retrieval
        // has already succeeded, so return the matched passages with an explicit
        // explanation instead of hiding them behind a failed job.
        await this.storage.putJson(answerKey, {
          jobId,
          status: "COMPLETED",
          answer: "The language model was unavailable. Retrieved matching passages are shown below.",
          selectedPassages: request.candidates.slice(0, AppConstants.maxSelectedPassages),
          retrievalDebug: {
            ...request.retrievalDebug,
            selectedPassages: request.candidates.slice(0, AppConstants.maxSelectedPassages),
          },
          completedAt: new Date().toISOString(),
        });
      } finally {
        this.logger.resetKeys();
      }
    }
  }
}
