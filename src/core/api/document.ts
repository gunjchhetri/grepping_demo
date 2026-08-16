import type { APIGatewayProxyEvent } from "aws-lambda";
import type {
  DocumentCompleteUploadRequest,
  DocumentUploadPartRequest,
  DocumentUploadRequest,
} from "../../types/core/api/document.js";
import type { ApiResponse } from "../../types/utils/http/http-response.js";
import { DocumentUploadService } from "../../services/documents/document-upload-service.js";
import { HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";

/** Processes the document API request and delegates business work to services. */
export class DocumentApi {
  /** Creates the API processor with its business service and HTTP helpers. */
  public constructor(
    private readonly documents: DocumentUploadService,
    private readonly request: RequestParser,
    private readonly response: HttpResponse,
  ) {}

  /** Extracts request details, routes the request, and converts unexpected errors into HTTP 400 responses. */
  public async handle(event: APIGatewayProxyEvent): Promise<ApiResponse> {
    try {
      const method = event.httpMethod;
      const path = (event.path || event.resource).replace(/\/+$/, "");
      const userId = this.request.userId(event.headers);

      return await this.route(method, path, event, userId);
    } catch (cause: unknown) {
      return this.response.error(400, cause instanceof Error ? cause.message : "Unable to process request");
    }
  }

  /** Maps the HTTP method and normalized path to the matching document operation. */
  private async route(method: string, path: string, event: APIGatewayProxyEvent, userId: string): Promise<ApiResponse> {
    switch (`${method} ${path}`) {
      case "GET /document":
        return this.list(userId);
      case "POST /document/upload/init":
        return this.createUpload(event, userId);
      case "POST /document/upload/part-url":
        return this.createPartUpload(event, userId);
      case "POST /document/upload/complete":
        return this.completeUpload(event, userId);
      case "POST /document/upload/abort":
        return this.abortUpload(event, userId);
      default:
        return this.response.error(404, "Route not found");
    }
  }

  /** Retrieves the authenticated user's documents and returns them as an HTTP 200 response. */
  private async list(userId: string): Promise<ApiResponse> {
    return this.response.json(200, { documents: await this.documents.list(userId) });
  }

  /** Validates the upload request and creates an S3 multipart upload. */
  private async createUpload(event: APIGatewayProxyEvent, userId: string): Promise<ApiResponse> {
    const body = this.request.body<DocumentUploadRequest>(event.body);

    return this.response.json(200, await this.documents.createUpload(userId, body.contentType ?? ""));
  }

  private async createPartUpload(event: APIGatewayProxyEvent, userId: string): Promise<ApiResponse> {
    const body = this.request.body<DocumentUploadPartRequest>(event.body);

    return this.response.json(
      200,
      await this.documents.createPartUpload(
        userId,
        this.request.requireString(body.documentId, "documentId"),
        this.request.requireString(body.uploadId, "uploadId"),
        body.partNumber ?? 0,
      ),
    );
  }

  private async completeUpload(event: APIGatewayProxyEvent, userId: string): Promise<ApiResponse> {
    const body = this.request.body<DocumentCompleteUploadRequest>(event.body);

    await this.documents.completeUpload(
      userId,
      this.request.requireString(body.documentId, "documentId"),
      this.request.requireString(body.uploadId, "uploadId"),
      body.parts ?? [],
    );

    return this.response.json(200, { status: "UPLOADED" });
  }

  private async abortUpload(event: APIGatewayProxyEvent, userId: string): Promise<ApiResponse> {
    const body = this.request.body<DocumentUploadPartRequest>(event.body);

    await this.documents.abortUpload(
      userId,
      this.request.requireString(body.documentId, "documentId"),
      this.request.requireString(body.uploadId, "uploadId"),
    );

    return this.response.json(200, { status: "ABORTED" });
  }
}
