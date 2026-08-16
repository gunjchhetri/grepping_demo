import type { APIGatewayProxyEvent } from "aws-lambda";
import { AppConfig } from "../../config/app-config.js";
import { DocumentApi } from "../../core/api/document.js";
import { DocumentService } from "../../services/documents/document-service.js";
import { S3ObjectStore } from "../../infrastructure/storage/s3-object-store.js";
import { HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";

const config = new AppConfig();
const documentApi = new DocumentApi(
  new DocumentService(new S3ObjectStore(config.documentsBucket)),
  new RequestParser(),
  new HttpResponse(config.corsOrigin),
);

export const handler = (event: APIGatewayProxyEvent) => documentApi.handle(event);
