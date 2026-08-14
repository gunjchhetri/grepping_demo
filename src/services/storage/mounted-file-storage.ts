import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { AppConstants } from "../../constants/app-constants.js";
import { AppConfig } from "../../utils/app-config.js";
import { AbstractFileStorage, type StorageEntry } from "./abstract-file-storage.js";

/** File-storage implementation backed by the mounted S3 Files access point. */
export class MountedFileStorage extends AbstractFileStorage {
  public constructor(private readonly root = AppConfig.documentsMountPath()) {
    super();
  }

  /** Reads a mounted S3 object as raw bytes. */
  public async getBytes(key: string): Promise<Uint8Array> {
    return readFile(this.pathForKey(key));
  }

  /** Reads a mounted S3 object and decodes it as text. */
  public async getText(key: string): Promise<string> {
    return Buffer.from(await this.getBytes(key)).toString(AppConstants.textEncoding);
  }

  /** Reads and parses a mounted S3 object as JSON. */
  public async getJson<T>(key: string): Promise<T> {
    return JSON.parse(await this.getText(key)) as T;
  }

  /** Writes raw bytes through the mounted S3 Files access point. */
  public async putBytes(key: string, value: Uint8Array): Promise<void> {
    await this.ensureParent(key);
    await writeFile(this.pathForKey(key), value);
  }

  /** Writes text through the mounted S3 Files access point. */
  public async putText(key: string, value: string): Promise<void> {
    await this.ensureParent(key);
    await writeFile(this.pathForKey(key), value, AppConstants.textEncoding);
  }

  /** Serializes and writes JSON through the mounted S3 Files access point. */
  public async putJson(key: string, value: unknown): Promise<void> {
    await this.putText(key, JSON.stringify(value));
  }

  /** Checks whether a mounted S3 path exists. */
  public async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathForKey(key), constants.F_OK);

      return true;
    } catch (error: unknown) {
      if (this.isMissingPath(error)) {
        return false;
      }

      throw error;
    }
  }

  /** Recursively lists mounted files below a key prefix. */
  public async list(prefix: string): Promise<StorageEntry[]> {
    const directory = this.pathForKey(prefix);

    if (!(await this.exists(prefix))) {
      return [];
    }

    const entries: StorageEntry[] = [];

    await this.walk(directory, entries);

    return entries;
  }

  private async walk(directory: string, entries: StorageEntry[]): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        await this.walk(child, entries);
        continue;
      }

      const metadata = await stat(child);
      const key = relative(this.root, child).split(sep).join("/");

      entries.push({ path: key, lastModified: metadata.mtime });
    }
  }

  private async ensureParent(key: string): Promise<void> {
    await mkdir(dirname(this.pathForKey(key)), { recursive: true });
  }

  private pathForKey(key: string): string {
    if (isAbsolute(key)) {
      throw new Error("Mounted S3 paths must be relative keys");
    }

    const root = resolve(this.root);
    const path = resolve(root, key);
    const pathFromRoot = relative(root, path);

    if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
      throw new Error("Mounted S3 paths must remain below the access point root");
    }

    return path;
  }

  private isMissingPath(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    const code = (error as { code?: string }).code;

    return code === "ENOENT" || code === "ENOTDIR";
  }
}
