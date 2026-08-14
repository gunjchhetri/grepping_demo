const STORAGE_KEY = "tracerag.user-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Every browser gets a UUID the first time it loads the page. It is kept in local storage
 * and sent with each request so the backend can namespace this session's S3 objects.
 * There is no sign-in and nothing is recoverable: another machine starts a fresh session.
 */
export function getUserId() {
  const stored = readStored();

  if (stored) {
    return stored;
  }

  const created = createUuid();

  window.localStorage.setItem(STORAGE_KEY, created);

  return created;
}

/** Discards the current session and mints a new one, hiding every document behind the old id. */
export function resetUserId() {
  window.localStorage.removeItem(STORAGE_KEY);

  return getUserId();
}

/** Shortens an id for display in the header chip. */
export function shortenUserId(userId) {
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

function readStored() {
  try {
    const value = (window.localStorage.getItem(STORAGE_KEY) ?? "").trim().toLowerCase();

    return UUID_PATTERN.test(value) ? value : "";
  } catch {
    // Private-mode local storage can throw on read; fall through to a fresh id.
    return "";
  }
}

function createUuid() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  // randomUUID needs a secure context, so keep a fallback for plain-http hosts.
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
