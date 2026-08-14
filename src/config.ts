import type { LlmProviderName } from "./types/llm.js";

/** Single place where the Lambda environment is read. */
export class AppConfig {
  public static documentsBucket(): string {
    return AppConfig.required("DOCUMENTS_BUCKET");
  }

  public static jobsBucket(): string {
    return AppConfig.required("JOBS_BUCKET");
  }

  public static llmProvider(): LlmProviderName {
    return AppConfig.required("LLM_PROVIDER") as LlmProviderName;
  }

  public static llmModel(): string {
    return AppConfig.required("LLM_MODEL");
  }

  public static llmSecretArn(): string {
    return AppConfig.required("LLM_SECRET_ARN");
  }

  /** Where the S3 Files access point is mounted inside the VPC functions. */
  public static documentsMountPath(): string {
    return process.env.DOCUMENTS_MOUNT_PATH ?? "/mnt/documents";
  }

  /** Browser origin echoed on API responses; the HTTP API enforces the real allow-list. */
  public static corsOrigin(): string {
    return process.env.API_CORS_ORIGIN ?? "*";
  }

  private static required(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
  }
}
