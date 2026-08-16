export class UserIdentity {
  public static readonly header = "x-user-id";
  private static readonly pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  public isValid(value: unknown): value is string {
    return typeof value === "string" && UserIdentity.pattern.test(value.trim().toLowerCase());
  }

  public parse(value: unknown): string {
    if (!this.isValid(value)) {
      throw new Error(`${UserIdentity.header} must be a UUID`);
    }

    return value.trim().toLowerCase();
  }
}
