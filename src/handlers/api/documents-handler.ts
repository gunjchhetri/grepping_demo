import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { ApiResponse } from "../../types/domain.js";
import { HttpResponse, UserIdentity } from "../../utils/core-utils.js";
import { AppConfig } from "../../utils/app-config.js";
import { DocumentService } from "../../services/documents/document-service.js";
import { S3Storage } from "../../services/storage/s3-storage.js";

/** Handles GET /documents and lists the documents owned by the calling browser session. */
export class DocumentsHandler {
  // Use the S3 API for listing so status reflects newly-written objects without
  // waiting for the mounted S3 Files directory view to refresh.
  private readonly storage = new S3Storage(AppConfig.documentsBucket());
  private readonly documents = new DocumentService(this.storage);
  private readonly identity = new UserIdentity();
  private readonly response = new HttpResponse();

  /** Handles GET /documents requests. */
  public async handle(event: APIGatewayProxyEventV2): Promise<ApiResponse<unknown>> {
    try {
      if (event.requestContext.http.method !== "GET") {
        return this.response.error(405, "Only GET /documents is supported");
      }

      const userId = this.identity.fromHeaders(event.headers);

      return this.response.json(200, { documents: await this.documents.list(userId) });
    } catch (error: unknown) {
      return this.response.error(400, error instanceof Error ? error.message : "Unable to process document request");
    }
  }
}
