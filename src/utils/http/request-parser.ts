import { UserIdentity } from "../identity/user-identity.js";

/** Pulls validated values out of an incoming API Gateway request. */
export class RequestParser {
  public constructor(private readonly identity: UserIdentity = new UserIdentity()) {}

  /** Reads and validates the calling session's user id from the request headers. */
  public userId(headers: Record<string, string | undefined> | undefined): string {
    const match = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === UserIdentity.header);

    return this.identity.parse(match?.[1]);
  }

  /** Parses a request body, rejecting anything that is not JSON. */
  public body<T>(raw: string | undefined): T {
    try {
      return JSON.parse(raw ?? "{}") as T;
    } catch {
      throw new Error("body must be valid JSON");
    }
  }

  /** Returns a trimmed non-empty string or throws naming the offending field. */
  public requireString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${name} is required`);
    }

    return value.trim();
  }
}
