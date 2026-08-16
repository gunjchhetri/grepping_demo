import { UserIdentity } from "../identity/user-identity.js";

/** Parses transport-level values before they enter the application layer. */
export class RequestParser {
  public constructor(private readonly identity = new UserIdentity()) {}

  public userId(headers: Record<string, string | undefined> | undefined): string {
    const match = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === UserIdentity.header);

    return this.identity.parse(match?.[1]);
  }

  public body<T>(raw: string | null | undefined): T {
    try {
      return JSON.parse(raw ?? "{}") as T;
    } catch {
      throw new Error("body must be valid JSON");
    }
  }

  public requireString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${name} is required`);
    }

    return value.trim();
  }
}
