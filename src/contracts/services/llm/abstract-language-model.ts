/** Abstract language-model contract used by LLM services. */
export abstract class AbstractLanguageModel {
  public abstract complete(systemPrompt: string, userPrompt: string): Promise<string>;

  public abstract stream(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
}
