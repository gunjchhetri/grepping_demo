import type { APIGatewayProxyEventV2, S3Event } from "aws-lambda";
import { DocumentsHandler } from "./api/documents-handler.js";
import { DocumentUploadHandler } from "./api/document-upload-handler.js";
import { QuestionsHandler } from "./api/questions-handler.js";
import { DocumentProcessor, type ObjectCreatedEvent } from "./s3-events/document-processor.js";
import { QuestionWorker } from "./s3-events/question-worker.js";

export const documents = (event: APIGatewayProxyEventV2) => new DocumentsHandler().handle(event);
export const documentUploads = (event: APIGatewayProxyEventV2) => new DocumentUploadHandler().handle(event);
export const questions = (event: APIGatewayProxyEventV2) => new QuestionsHandler().handle(event);
export const processDocument = (event: ObjectCreatedEvent) => new DocumentProcessor().handle(event);
export const processJob = (event: S3Event) => new QuestionWorker().handle(event);
