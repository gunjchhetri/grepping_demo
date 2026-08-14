import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import type { LlmProviderName } from "../../types/domain.js";
import { AppConfig } from "../../utils/app-config.js";

/** Creates the configured LangChain chat model and loads credentials for external providers. */
export class LlmProvider {
  private static readonly secrets = new SecretsManagerClient({});

  /** Creates an OpenAI, Anthropic, or Bedrock chat model from the supplied configuration. */
  public static async getModel(provider: LlmProviderName, model: string): Promise<BaseChatModel> {
    let apiKey: string | undefined;

    if (provider !== "bedrock") {
      apiKey = await LlmProvider.apiKey();
    }

    switch (provider) {
      case "openai":
        return new ChatOpenAI({ model, apiKey });
      case "anthropic":
        return new ChatAnthropic({ model, apiKey });
      case "bedrock":
        return new ChatBedrockConverse({ model });
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /** Reads the configured API key from Secrets Manager for OpenAI or Anthropic. */
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
