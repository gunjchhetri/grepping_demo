import type { APIGatewayProxyEvent } from "aws-lambda";
import { AppConfig } from "../../config/app-config.js";
import { QuestionApi } from "../../core/api/question.js";
import { LangChainLanguageModel } from "../../infrastructure/llm/langchain-language-model.js";
import { MountedDocumentStore } from "../../infrastructure/filesystem/mounted-document-store.js";
import { RipgrepTextSearch } from "../../infrastructure/retrieval/ripgrep-text-search.js";
import { LlmService } from "../../services/llm/llm-service.js";
import { QuestionService } from "../../services/questions/question-service.js";
import { DocumentRetriever } from "../../services/retrieval/document-retriever.js";
import { HttpResponse } from "../../utils/http/http-response.js";
import { RequestParser } from "../../utils/http/request-parser.js";

const config = new AppConfig();
const model = new LangChainLanguageModel(config.llmProvider, config.llmModel, config.llmSecretArn);
const llm = new LlmService(model);
const retriever = new DocumentRetriever(
  new MountedDocumentStore(config.documentsMountPath),
  llm,
  new RipgrepTextSearch(),
);
const questionApi = new QuestionApi(
  new QuestionService(retriever, llm),
  new RequestParser(),
  new HttpResponse(config.corsOrigin),
);

export const handler = awslambda.streamifyResponse<APIGatewayProxyEvent>((event, responseStream) =>
  questionApi.handle(event, responseStream),
);
