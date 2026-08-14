export interface StorageEntry {
  path: string;
  lastModified?: Date;
}

/** Defines file-storage operations for backends that store documents as files. */
export abstract class AbstractFileStorage {
  /** Reads a stored file as raw bytes. */
  public abstract getBytes(path: string): Promise<Uint8Array>;

  /** Reads a stored file as text. */
  public abstract getText(path: string): Promise<string>;

  /** Reads and parses a stored file as JSON. */
  public abstract getJson<T>(path: string): Promise<T>;

  /** Writes text to a file path. */
  public abstract putText(path: string, value: string): Promise<void>;

  /** Serializes and writes JSON to a file path. */
  public abstract putJson(path: string, value: unknown): Promise<void>;

  /** Checks whether a file path exists. */
  public abstract exists(path: string): Promise<boolean>;

  /** Lists stored files below a path prefix. */
  public abstract list(prefix: string): Promise<StorageEntry[]>;
}
