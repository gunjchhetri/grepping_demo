import { AppConfig } from "../../config.js";
import { UserIdentity } from "../identity/user-identity.js";

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Builds the JSON responses every API handler returns. */
export class HttpResponse {
  /** Creates a JSON response carrying the API's CORS headers. */
  public json(statusCode: number, payload: unknown): ApiResponse {
    return {
      statusCode,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": AppConfig.corsOrigin(),
        "access-control-allow-headers": `content-type,${UserIdentity.header}`,
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify(payload),
    };
  }

  /** Creates a JSON error response. */
  public error(statusCode: number, message: string): ApiResponse {
    return this.json(statusCode, { message });
  }
}
