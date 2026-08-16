import type { LlmProviderName } from "../types/config/app-config.js";

/** Lazily reads deployment settings so each Lambda validates only what it uses. */
export class AppConfig {
  private static readonly supportedProviders = new Set<LlmProviderName>(["openai", "anthropic", "bedrock"]);

  public constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  public get documentsBucket(): string {
    return this.required("DOCUMENTS_BUCKET");
  }

  public get documentsMountPath(): string {
    return this.env.DOCUMENTS_MOUNT_PATH ?? "/mnt/documents";
  }

  public get corsOrigin(): string {
    return this.env.API_CORS_ORIGIN ?? "*";
  }

  public get llmProvider(): LlmProviderName {
    const provider = this.required("LLM_PROVIDER");

    if (!AppConfig.supportedProviders.has(provider as LlmProviderName)) {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    return provider as LlmProviderName;
  }

  public get llmModel(): string {
    return this.required("LLM_MODEL");
  }

  public get llmSecretArn(): string | undefined {
    return this.env.LLM_SECRET_ARN || undefined;
  }

  private required(name: string): string {
    const value = this.env[name];

    if (!value) {
      throw new Error(`Missing environment variable: ${name}`);
    }

    return value;
  }
}
