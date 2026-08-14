/**
 * Every browser gets a UUID the first time it loads the page. It is kept in local storage
 * and sent with each request so the backend can namespace this session's S3 objects.
 * There is no sign-in and nothing is recoverable: another machine starts a fresh session.
 */
export class Session {
  static storageKey = "tracerag.user-id";
  static uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Returns this browser's user id, creating and storing one on first visit. */
  userId() {
    const stored = this.readStored();

    if (stored) {
      return stored;
    }

    const created = this.createUuid();

    window.localStorage.setItem(Session.storageKey, created);

    return created;
  }

  /** Discards the current session and mints a new one, hiding every document behind the old id. */
  reset() {
    window.localStorage.removeItem(Session.storageKey);

    return this.userId();
  }

  /** Shortens an id for display in the header chip. */
  shorten(userId) {
    return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
  }

  readStored() {
    try {
      const value = (window.localStorage.getItem(Session.storageKey) ?? "").trim().toLowerCase();

      return Session.uuidPattern.test(value) ? value : "";
    } catch {
      // Private-mode local storage can throw on read; fall through to a fresh id.
      return "";
    }
  }

  createUuid() {
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
}
