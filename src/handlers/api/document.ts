import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppConfig } from "../../config.js";
import { DocumentService } from "../../services/documents/document-service.js";
import { type ApiResponse, HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";
import { S3Store } from "../../services/storage/s3-store.js";

type Route = (event: APIGatewayProxyEventV2, userId: string) => Promise<ApiResponse>;

/** Serves every /document route from a single Lambda, dispatched on method and path. */
export class DocumentHandler {
  private readonly store = new S3Store(AppConfig.documentsBucket());
  private readonly documents = new DocumentService(this.store);
  private readonly request = new RequestParser();
  private readonly response = new HttpResponse();

  private readonly routes: Record<string, Route> = {
    "GET /document": (event, userId) => this.list(event, userId),
    "POST /document/upload-url": (event, userId) => this.createUpload(event, userId),
    "POST /document/process": (event, userId) => this.startProcessing(event, userId),
  };

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    try {
      const method = event.requestContext.http.method;
      const path = (event.rawPath || event.requestContext.http.path).replace(/\/+$/, "");
      const route = this.routes[`${method} ${path}`];

      if (!route) {
        return this.response.error(404, "Route not found");
      }

      // Awaited so a rejection is caught here and answered as a 400.
      return await route(event, this.request.userId(event.headers));
    } catch (cause: unknown) {
      return this.response.error(400, cause instanceof Error ? cause.message : "Unable to process request");
    }
  }

  private async list(_event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    return this.response.json(200, { documents: await this.documents.list(userId) });
  }

  private async createUpload(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const { contentType } = this.request.body<{ contentType?: string }>(event.body);

    return this.response.json(200, await this.documents.createUpload(userId, contentType ?? ""));
  }

  private async startProcessing(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const body = this.request.body<{ documentId?: string; key?: string }>(event.body);
    const documentId = this.request.requireString(body.documentId, "documentId");
    const key = this.request.requireString(body.key, "key");

    await this.documents.startProcessing(userId, documentId, key);

    return this.response.json(202, { documentId, status: "PROCESSING" });
  }
}

let instance: DocumentHandler | undefined;

export const handler = (event: APIGatewayProxyEventV2) => (instance ??= new DocumentHandler()).handle(event);
