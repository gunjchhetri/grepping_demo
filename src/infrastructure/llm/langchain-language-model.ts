import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { LlmProviderName } from "../../types/config/app-config.js";
import { AbstractLanguageModel } from "../../contracts/services/llm/abstract-language-model.js";

/** LangChain adapter implementing the LLM service contract. */
export class LangChainLanguageModel extends AbstractLanguageModel {
  private static readonly requestTimeoutMs = 120_000;
  private readonly secrets = new SecretsManagerClient({});
  private modelPromise?: Promise<BaseChatModel>;

  public constructor(
    private readonly provider: LlmProviderName,
    private readonly modelName: string,
    private readonly secretArn?: string,
  ) {
    super();
  }

  public async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const invoke = this.invoke(systemPrompt, userPrompt);
    let timer: NodeJS.Timeout | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("LLM request timed out")), LangChainLanguageModel.requestTimeoutMs);
      });

      return await Promise.race([invoke, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async invoke(systemPrompt: string, userPrompt: string): Promise<string> {
    const result = await (await this.model()).invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);

    return this.contentText(result.content);
  }

  private contentText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }

    return Array.isArray(content)
      ? content
          .map((part) =>
            typeof part === "string"
              ? part
              : part !== null && typeof part === "object" && "text" in part
                ? String(part.text)
                : "",
          )
          .join("")
      : "";
  }

  private model(): Promise<BaseChatModel> {
    return (this.modelPromise ??= this.createModel());
  }

  private async createModel(): Promise<BaseChatModel> {
    switch (this.provider) {
      case "bedrock":
        return new ChatBedrockConverse({ model: this.modelName });
      case "openai":
        return new ChatOpenAI({ model: this.modelName, apiKey: await this.apiKey() });
      case "anthropic":
        return new ChatAnthropic({ model: this.modelName, apiKey: await this.apiKey() });
      default:
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  private async apiKey(): Promise<string> {
    if (!this.secretArn) {
      throw new Error(`LLM_SECRET_ARN is required for ${this.provider}`);
    }

    const secret = await this.secrets.send(new GetSecretValueCommand({ SecretId: this.secretArn }));
    const value = secret.SecretString ? (JSON.parse(secret.SecretString) as { apiKey?: string }) : {};

    if (!value.apiKey) {
      throw new Error(`Secret ${this.secretArn} must contain an apiKey field`);
    }

    return value.apiKey;
  }
}
