import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Read-only filesystem adapter for the S3 Files document mount. */
export class MountedDocumentStore {
  public constructor(private readonly root: string) {}

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

  public async readText(key: string): Promise<string> {
    return readFile(this.pathFor(key), "utf8");
  }

  public async readJson<T>(key: string): Promise<T> {
    return JSON.parse(await this.readText(key)) as T;
  }

  public requirePath(key: string): string {
    if (!this.exists(key)) {
      throw new Error(`Extracted document is not available: ${key}`);
    }

    return this.pathFor(key);
  }
}
