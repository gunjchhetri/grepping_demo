import type { S3Event } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { AppConfig } from "../../config.js";
import { LlmService } from "../../llm/llm-service.js";
import { S3Keys } from "../../storage/s3-keys.js";
import { S3Store } from "../../storage/s3-store.js";
import type { Passage, QuestionAnswer, QuestionRequest } from "../../types.js";

const MODEL_UNAVAILABLE = "The language model was unavailable. The retrieved passages are shown below.";

/** Triggered by a queued question. Answers it from the retrieved passages and stores the result. */
export class QuestionWorker {
  private readonly jobs = new S3Store(AppConfig.jobsBucket());
  private readonly llm = new LlmService(AppConfig.llmProvider(), AppConfig.llmModel());
  private readonly logger = new Logger({ serviceName: "question-worker" });

  public async handle(event: S3Event): Promise<void> {
    for (const record of event.Records) {
      await this.processOne(decodeURIComponent(record.s3.object.key.replace(/\+/g, " ")));
    }
  }

  private async processOne(key: string): Promise<void> {
    const parts = S3Keys.parseQuestionRequest(key);

    if (!parts) {
      return;
    }

    const { userId, jobId } = parts;
    const answerKey = S3Keys.questionAnswer(userId, jobId);
    const request = await this.jobs.readJson<QuestionRequest>(key);

    // S3 delivers events at least once; a written answer means this job is done.
    if (!request || (await this.jobs.exists(answerKey))) {
      return;
    }

    this.logger.appendKeys({ documentId: request.documentId, jobId });

    try {
      const { answer, sourceIds } = await this.llm.answer(request.question, request.passages);
      const sources = request.passages.filter((passage) => sourceIds.includes(passage.id));

      await this.write(answerKey, jobId, answer, sources);
      this.logger.info("Question answered");
    } catch (cause: unknown) {
      // Retrieval already succeeded, so return the matched passages with an honest
      // explanation rather than leaving the browser polling a job that never lands.
      this.logger.error("Question failed", { error: cause instanceof Error ? cause.message : String(cause) });
      await this.write(answerKey, jobId, MODEL_UNAVAILABLE, request.passages.slice(0, 3));
    } finally {
      this.logger.resetKeys();
    }
  }

  private async write(key: string, jobId: string, answer: string, sources: Passage[]): Promise<void> {
    const result: QuestionAnswer = {
      jobId,
      status: "COMPLETED",
      answer,
      sources,
      completedAt: new Date().toISOString(),
    };

    await this.jobs.putJson(key, result);
  }
}
