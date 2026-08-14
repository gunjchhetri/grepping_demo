# TraceRAG: DB-less RAG with S3 Files + ripgrep

This is a full-stack demo of document Q&A without embeddings, a vector database, BM25, OpenSearch, or a retrieval index.

The retrieval path is:

```text
PDF → page-preserving text in S3 → S3 Files mount → ripgrep → dynamic passages → lexical scoring → LLM reranking → answer
```

## Project layout

```text
template.yaml                 SAM/CloudFormation infrastructure
src/handlers/api              HTTP business handlers
src/handlers/s3-events        S3 event business handlers
src/services/llm              the single LangChain provider/model service
src/services/storage          abstract storage contract and S3 implementation
src/services/text             PDF extraction, ripgrep, and passage creation
src/utils/core-utils.ts       shared helpers grouped in one file
src/constants                 shared configuration constants
frontend                      static HTML/CSS/JS demo UI (no framework, no build step)
```

Every handler, service, and utility is represented by a class. Lambda entry points in `src/handlers/index.ts` create the handlers and delegate to their `handle` method.

## Sessions

There is no Cognito, no email, and no login. The browser mints a UUID on first load with `crypto.randomUUID()`, keeps it in `localStorage`, and sends it as the `x-user-id` header on every HTTP call and as `?userId=` on the WebSocket connect. The backend validates it as a UUID and uses it as an S3 key segment, so every user's documents and jobs live under their own prefix:

```text
documents/<userId>/<documentId>/original.pdf
documents/<userId>/<documentId>/document.txt
processing/<userId>/<documentId>.json
llm-requests/<userId>/<jobId>.json
llm-responses/<userId>/<jobId>.json
```

Opening the app on another machine produces a new UUID and therefore an empty library. Clearing site data has the same effect, and the header's **new** button mints a fresh id on demand. This id is a namespace, not an authentication claim: the API is unauthenticated, so anyone who knows an id can read that namespace. Do not put real data in a deployment of this demo.

## Prerequisites

- AWS SAM CLI
- Node.js 22+
- Python 3 (only to serve the static frontend locally)
- `rg` installed locally if you want to run the retrieval command directly (`brew install ripgrep` on macOS)
- An AWS account and region with the S3 Files CloudFormation resource types available

## Local checks

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

The frontend has no build step, no `package.json`, and no `node_modules`. It is plain ES modules plus `axios` from a CDN `<script>` tag.

The LLM service uses LangChain integrations for OpenAI, Anthropic, or Amazon Bedrock. Provider and model are passed into `LlmService` at construction time.

## Deploy the backend

The SAM template provisions the two private S3 buckets, a VPC, two private subnets, an S3 gateway endpoint, an S3 Files file system/access point/mount targets, an unauthenticated HTTP API, presigned-upload IAM permissions, Lambda functions, and S3 event filters. It intentionally provisions no Cognito, NAT Gateway, interface VPC endpoint, DynamoDB, OpenSearch, or vector store.

The retrieval Lambda needs a Lambda layer containing the `rg` executable because ripgrep is not part of the managed Node.js runtime. Supply it at deploy time:

```bash
sam build
sam deploy --guided \
  --parameter-overrides \
  LLMProvider=bedrock \
  LLMModel=amazon.nova-lite-v1:0 \
  RipgrepLayerArn=arn:aws:lambda:REGION:ACCOUNT:layer:rg:VERSION \
  FrontendOrigin=http://localhost:5173
```

For an external provider, create a Secrets Manager secret with this shape:

```json
{ "apiKey": "your-provider-key" }
```

Then pass its ARN and provider/model:

```bash
sam deploy \
  --parameter-overrides \
  LLMProvider=openai \
  LLMModel=gpt-4o-mini \
  LLMSecretArn=arn:aws:secretsmanager:REGION:ACCOUNT:secret:NAME \
  RipgrepLayerArn=arn:aws:lambda:REGION:ACCOUNT:layer:rg:VERSION
```

Bedrock does not need `LLMSecretArn`; the template grants the LLM Lambda invocation permission for the configured foundation model ARN.

## Run the UI

```bash
cp frontend/config.example.js frontend/config.js
```

Fill `frontend/config.js` with the `ApiUrl` stack output, then serve the folder:

```bash
npm run frontend:dev
```

That serves `frontend/` on <http://localhost:5173>, which matches the default `FrontendOrigin`. Any static server works; the origin just has to match what the stack allows.

The UI requests a short-lived presigned S3 PUT URL from `POST /documents/upload-url`, uploads the PDF directly to `documents/<userId>/<documentId>/original.pdf`, and calls `POST /documents/process` with that key. The backend verifies the object and writes a processing marker under `processing/`; S3 EventBridge invokes the PDF processor for that marker. The processor reads the source through the mounted S3 Files access point and writes extracted text back to the same S3 bucket through its scoped S3 API permission; the documents and questions APIs read through the mount. After upload, the UI polls `GET /documents` until the extracted text object exists, showing `PROCESSING` and then `READY`. Asking a question writes an LLM request object; the response is written under `llm-responses/`. Only `llm-requests/` triggers the LLM Lambda, so response writes cannot recurse. The UI polls `GET /questions/{jobId}` until the response object appears.

## Design notes

- Retrieval chunks are ranges created for one question and are never persisted.
- Query terms are escaped before they become a ripgrep PCRE2 OR expression.
- If the precise expansion returns no matches, one broader query-expansion attempt is made.
- Document and job status are derived from S3 object existence/listing; there is no database.
- The S3 Files access point is mounted at `/mnt/documents` on the documents API, retrieval API, and PDF processor; document-bucket access is filesystem-based throughout the backend.
- Document and job progress reach the browser by polling `GET /documents` and `GET /questions/{jobId}`; the response object's existence is the completion signal.

## Serverless Design Decisions

- S3 Files + VPC-mounted document APIs and processor -> keeps all backend document access file-oriented while keeping source text in S3.
- S3 gateway endpoint -> lets the VPC Lambda write/read S3 without a NAT Gateway.
- S3 EventBridge routing -> separates PDF processing from LLM jobs and avoids a bucket/filesystem deployment dependency cycle.
- S3 objects as request/response state -> removes the need for a retrieval database while preserving an inspectable async workflow.
- Browser-minted UUID instead of Cognito -> gives per-user isolation of stored files with no identity provider, no sign-in, and no recovery.
- On-demand, database-free design -> keeps the demo intentionally small and cost-aware.
