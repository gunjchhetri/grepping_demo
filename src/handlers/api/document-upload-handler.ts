import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { ApiResponse } from "../../types/domain.js";
import { DocumentUploadService } from "../../services/documents/document-upload-service.js";
import { HttpResponse, UserIdentity, Validation } from "../../utils/core-utils.js";

/** Handles the public presigned-upload and processing-start endpoints. */
export class DocumentUploadHandler {
  private readonly uploads = new DocumentUploadService();
  private readonly identity = new UserIdentity();
  private readonly response = new HttpResponse();
  private readonly validation = new Validation();

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse<unknown>> {
    try {
      if (event.requestContext.http.method !== "POST") {
        return this.response.error(405, "Only POST is supported");
      }

      const path = event.rawPath || event.requestContext.http.path;
      const userId = this.identity.fromHeaders(event.headers);

      // Awaited so rejections land in this catch instead of escaping as a 500.
      if (path.endsWith("/upload-url")) {
        return await this.createUpload(event, userId);
      }

      if (path.endsWith("/process")) {
        return await this.startProcessing(event, userId);
      }

      return this.response.error(404, "Upload route not found");
    } catch (error: unknown) {
      return this.response.error(400, error instanceof Error ? error.message : "Unable to process upload request");
    }
  }

  private async createUpload(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse<unknown>> {
    const body = this.validation.parseJson<{ contentType?: string }>(event.body ?? "{}", "body");
    const contentType = body.contentType ?? "";
    const ticket = await this.uploads.createUpload(userId, contentType);

    return this.response.json(200, ticket);
  }

  private async startProcessing(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse<unknown>> {
    const body = this.validation.parseJson<{ documentId?: string; key?: string }>(event.body ?? "{}", "body");
    const documentId = this.validation.requiredString(body.documentId, "documentId");
    const key = this.validation.requiredString(body.key, "key");

    await this.uploads.startProcessing(userId, documentId, key);

    return this.response.json(202, { documentId, key, status: "PROCESSING" });
  }
}
