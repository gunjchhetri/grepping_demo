import { AppConfig } from "../config.js";
import { USER_ID_HEADER } from "../user-id.js";

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Builds a JSON response with the API's CORS headers. */
export function json(statusCode: number, payload: unknown): ApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": AppConfig.corsOrigin(),
      "access-control-allow-headers": `content-type,${USER_ID_HEADER}`,
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(payload),
  };
}

export function error(statusCode: number, message: string): ApiResponse {
  return json(statusCode, { message });
}

/** Parses a request body, rejecting anything that is not JSON. */
export function parseBody<T>(body: string | undefined): T {
  try {
    return JSON.parse(body ?? "{}") as T;
  } catch {
    throw new Error("body must be valid JSON");
  }
}

/** Returns a trimmed non-empty string or throws with the field's name. */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}
