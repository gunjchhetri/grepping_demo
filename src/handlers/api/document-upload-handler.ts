import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppConfig } from "../../config.js";
import { DocumentUploadService } from "../../documents/document-upload-service.js";
import { type ApiResponse, error, json, parseBody, requireString } from "../../http/api-response.js";
import { S3Store } from "../../storage/s3-store.js";
import { userIdFromHeaders } from "../../user-id.js";

/** POST /documents/upload-url and POST /documents/process. */
export class DocumentUploadHandler {
  private readonly uploads = new DocumentUploadService(new S3Store(AppConfig.documentsBucket()));

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    try {
      const userId = userIdFromHeaders(event.headers);
      const path = event.rawPath || event.requestContext.http.path;

      // Awaited so a rejection is caught here and answered as a 400.
      if (path.endsWith("/upload-url")) {
        return await this.createUpload(event, userId);
      }

      if (path.endsWith("/process")) {
        return await this.startProcessing(event, userId);
      }

      return error(404, "Upload route not found");
    } catch (cause: unknown) {
      return error(400, cause instanceof Error ? cause.message : "Unable to process upload request");
    }
  }

  private async createUpload(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const { contentType } = parseBody<{ contentType?: string }>(event.body);

    return json(200, await this.uploads.createUpload(userId, contentType ?? ""));
  }

  private async startProcessing(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const body = parseBody<{ documentId?: string; key?: string }>(event.body);
    const documentId = requireString(body.documentId, "documentId");
    const key = requireString(body.key, "key");

    await this.uploads.startProcessing(userId, documentId, key);

    return json(202, { documentId, status: "PROCESSING" });
  }
}
