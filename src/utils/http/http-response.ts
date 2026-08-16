import type { ApiResponse } from "../../types/utils/http/http-response.js";
import { UserIdentity } from "../identity/user-identity.js";

/** Formats HTTP responses without depending on API Gateway details. */
export class HttpResponse {
  public constructor(private readonly corsOrigin: string) {}

  public json(statusCode: number, payload: unknown): ApiResponse {
    return {
      statusCode,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": this.corsOrigin,
        "access-control-allow-headers": `content-type,${UserIdentity.header}`,
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify(payload),
    };
  }

  public error(statusCode: number, message: string): ApiResponse {
    return this.json(statusCode, { message });
  }

  public stream(responseStream: awslambda.HttpResponseStream): awslambda.HttpResponseStream {
    return awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: this.headers("text/plain; charset=utf-8"),
    });
  }

  public streamError(responseStream: awslambda.HttpResponseStream, statusCode: number, message: string): void {
    const stream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode,
      headers: this.headers("application/json"),
    });

    stream.end(JSON.stringify({ message }));
  }

  private headers(contentType: string): Record<string, string> {
    return {
      "content-type": contentType,
      "access-control-allow-origin": this.corsOrigin,
      "access-control-allow-headers": `content-type,${UserIdentity.header}`,
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
  }
}
