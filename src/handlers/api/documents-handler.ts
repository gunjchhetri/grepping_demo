import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppConfig } from "../../config.js";
import { DocumentService } from "../../documents/document-service.js";
import { type ApiResponse, error, json } from "../../http/api-response.js";
import { S3Store } from "../../storage/s3-store.js";
import { userIdFromHeaders } from "../../user-id.js";

/** GET /documents — lists the documents belonging to the calling browser session. */
export class DocumentsHandler {
  // Listed through the S3 API rather than the mount so a just-written object shows up
  // immediately, without waiting for the mounted directory view to refresh.
  private readonly documents = new DocumentService(new S3Store(AppConfig.documentsBucket()));

  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse> {
    try {
      const userId = userIdFromHeaders(event.headers);

      return json(200, { documents: await this.documents.list(userId) });
    } catch (cause: unknown) {
      return error(400, cause instanceof Error ? cause.message : "Unable to list documents");
    }
  }
}
