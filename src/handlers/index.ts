import type { APIGatewayProxyEventV2, S3Event } from "aws-lambda";
import { DocumentsHandler } from "./api/documents-handler.js";
import { DocumentUploadHandler } from "./api/document-upload-handler.js";
import { QuestionsHandler } from "./api/questions-handler.js";
import { DocumentHandler } from "./s3-events/document-handler.js";
import { QuestionWorkerHandler } from "./s3-events/question-worker-handler.js";

export const documents = async (event: APIGatewayProxyEventV2) => new DocumentsHandler().handle(event);
export const documentUploads = async (event: APIGatewayProxyEventV2) => new DocumentUploadHandler().handle(event);
export const questions = async (event: APIGatewayProxyEventV2) => new QuestionsHandler().handle(event);
export const processDocument = async (event: Parameters<DocumentHandler["handle"]>[0]) =>
  new DocumentHandler().handle(event);
export const processJob = async (event: S3Event) => new QuestionWorkerHandler().handle(event);
