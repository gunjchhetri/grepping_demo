import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { AppConfig } from "../../config.js";

/**
 * Reads document objects as ordinary files through the S3 Files mount.
 *
 * This is the whole point of the demo: because S3 content appears on a POSIX path,
 * ripgrep can search it in place with no download, no index, and no vector store.
 */
export class MountedDocuments {
  public constructor(private readonly root = AppConfig.documentsMountPath()) {}

  /** Resolves an S3 key to its path on the mount, refusing anything outside the root. */
  public pathFor(key: string): string {
    if (isAbsolute(key)) {
      throw new Error("Mounted document paths must be relative keys");
    }

    const root = resolve(this.root);
    const path = resolve(root, key);
    const fromRoot = relative(root, path);

    if (fromRoot.startsWith(`..${sep}`) || fromRoot === "..") {
      throw new Error("Mounted document paths must stay below the access point root");
    }

    return path;
  }

  public exists(key: string): boolean {
    return existsSync(this.pathFor(key));
  }

  public async readBytes(key: string): Promise<Uint8Array> {
    return readFile(this.pathFor(key));
  }

  /** Resolves a key that must already exist, such as the file handed to ripgrep. */
  public requirePath(key: string): string {
    if (!this.exists(key)) {
      throw new Error(`Extracted document is not available: ${key}`);
    }

    return this.pathFor(key);
  }
}
