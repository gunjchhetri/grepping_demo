import { AppConstants } from "../constants/app-constants.js";
import type { LlmProviderName } from "../types/domain.js";

/** Centralizes environment names and runtime configuration used by handlers and services. */
export class AppConfig {
  /** Returns the configured jobs bucket name. */
  public static jobsBucket(): string {
    return AppConfig.required(AppConstants.jobsBucketEnv);
  }

  /** Returns the S3 bucket used for uploaded documents. */
  public static documentsBucket(): string {
    return AppConfig.required(AppConstants.documentsBucketEnv);
  }

  /** Returns the mounted document path or its default value. */
  public static documentsMountPath(): string {
    return process.env.DOCUMENTS_MOUNT_PATH ?? AppConstants.documentsMountPath;
  }

  /** Returns the configured LLM provider. */
  public static llmProvider(): LlmProviderName {
    return AppConfig.required(AppConstants.llmProviderEnv) as LlmProviderName;
  }

  /** Returns the configured LLM model name. */
  public static llmModel(): string {
    return AppConfig.required(AppConstants.llmModelEnv);
  }

  /** Returns the Secrets Manager ARN used for LLM credentials. */
  public static llmSecretArn(): string {
    return AppConfig.required(AppConstants.llmSecretEnv);
  }

  private static required(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
  }
}
