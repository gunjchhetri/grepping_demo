import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { AppConfig } from "../../config.js";
import type { LlmProviderName } from "../../types/llm.js";

/** Creates the configured LangChain chat model and loads credentials for external providers. */
export class LlmProvider {
  private static readonly secrets = new SecretsManagerClient({});

  public static async getModel(provider: LlmProviderName, model: string): Promise<BaseChatModel> {
    switch (provider) {
      case "bedrock":
        return new ChatBedrockConverse({ model });
      case "openai":
        return new ChatOpenAI({ model, apiKey: await LlmProvider.apiKey() });
      case "anthropic":
        return new ChatAnthropic({ model, apiKey: await LlmProvider.apiKey() });
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /** Reads the provider API key from Secrets Manager. Bedrock uses the execution role. */
  private static async apiKey(): Promise<string> {
    const secretArn = AppConfig.llmSecretArn();
    const secret = await LlmProvider.secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const value = secret.SecretString ? (JSON.parse(secret.SecretString) as { apiKey?: string }) : {};

    if (!value.apiKey) {
      throw new Error(`Secret ${secretArn} must contain an apiKey field`);
    }

    return value.apiKey;
  }
}
