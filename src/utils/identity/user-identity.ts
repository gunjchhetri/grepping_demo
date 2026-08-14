/**
 * The browser mints a UUID on first load and keeps it in local storage. It namespaces
 * that visitor's S3 objects and is deliberately not an authentication claim, so it is
 * validated strictly before it is ever used to build a key.
 */
export class UserIdentity {
  public static readonly header = "x-user-id";
  private static readonly pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Reports whether a raw value is a usable user namespace. */
  public isValid(value: unknown): value is string {
    return typeof value === "string" && UserIdentity.pattern.test(value.trim().toLowerCase());
  }

  /** Validates a raw identifier and returns its canonical lowercase form. */
  public parse(value: unknown): string {
    if (!this.isValid(value)) {
      throw new Error(`${UserIdentity.header} must be a UUID`);
    }

    return value.trim().toLowerCase();
  }
}
