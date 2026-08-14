const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const USER_ID_HEADER = "x-user-id";

/**
 * The browser mints a UUID on first load and keeps it in local storage. It namespaces
 * that visitor's S3 objects and is deliberately not an authentication claim, so it is
 * validated strictly before it is ever used to build a key.
 */
export function isUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim().toLowerCase());
}

/** Validates a raw identifier and returns its canonical lowercase form. */
export function parseUserId(value: unknown): string {
  if (!isUserId(value)) {
    throw new Error(`${USER_ID_HEADER} must be a UUID`);
  }

  return value.trim().toLowerCase();
}

/** Reads and validates the user identifier from request headers. */
export function userIdFromHeaders(headers: Record<string, string | undefined> | undefined): string {
  const match = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === USER_ID_HEADER);

  return parseUserId(match?.[1]);
}
