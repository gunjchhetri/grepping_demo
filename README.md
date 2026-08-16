# TraceRAG: RAG with ripgrep instead of a vector database

Document Q&A with no embeddings, no vector store, no OpenSearch, and no retrieval index of any kind.

S3 Files mounts an S3 bucket as a POSIX filesystem, so a Lambda function can run `ripgrep` directly over the
documents. That one fact removes the entire indexing half of a normal RAG stack:

```text
PDF → page-marked text in S3 → S3 Files mount → ripgrep → passages → lexical ranking → LLM answer
```

Upload a PDF, ask it a question. That is the whole app.

## Project layout

```text
template.yaml            SAM/CloudFormation infrastructure
frontend/                static HTML, CSS, and ES modules — no framework, no build step

src/
  handlers/              thin Lambda entry points that invoke core processors
  core/                  class-based Lambda processors, mirroring handlers/
    api/                  document.ts and question.ts
    queue/                document-processor.ts
  services/              business services
    documents/            document upload, extraction, and PDF text services
    questions/            question submission and streaming answer services
    retrieval/            passage construction, scoring, and retrieval
    llm/                  query expansion and evidence-backed answer services
  contracts/              the one retained abstract LLM provider boundary
  infrastructure/         AWS, filesystem, LangChain, and ripgrep adapters
  repository/             reserved for database repositories when persistence is added
  types/                  data types mirroring their owning core/service/config/utils path
    core/                  API and event types matching core/ exactly
  config/                 environment and deployment configuration
  utils/                  HTTP, identity, LLM parsing, and S3 key helpers
```

Handlers are thin adapters that assemble and invoke the class-based processors in `core/`.
Core processors consume business services. PDF extraction stays under `services/documents` because it is a
document-processing capability; infrastructure contains only external system adapters.

The interesting directory is `retrieval/`, split by responsibility:

| File                    | Responsibility                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| `ripgrep-search.ts`     | builds the search expression, runs `rg`, returns matching line numbers |
| `passage-builder.ts`    | groups nearby matches, pads them with context, merges overlaps         |
| `passage-scorer.ts`     | ranks passages by term weight, coverage, and match proximity           |
| `document-retriever.ts` | orchestrates the three, with one broader retry                         |

## Sessions

No Cognito, no email, no login. The browser generates a UUID on first load, keeps it in `localStorage`, and
sends it as `x-user-id`. The backend validates it and uses it as an S3 key segment, so each visitor gets their
own namespace:

```text
documents/<userId>/<documentId>/original.pdf
documents/<userId>/<documentId>/document.txt
documents/<userId>/<documentId>/<other-name>.pdf
documents/<userId>/<documentId>/<other-name>.txt
```

Opening the app elsewhere gives you a new UUID and an empty library. This is a namespace, not authentication:
the API is unauthenticated, so anyone with an id can read that namespace. Do not put real data in this demo.

## How a question flows

1. `POST /document/upload/init` starts an S3 multipart upload. The browser requests a presigned URL for each
   8 MB part, uploads each part directly to S3, then calls `POST /document/upload/complete` with the returned ETags.
2. `POST /document/process` is an API Gateway → SQS integration with no Lambda in the write path; it
   enqueues the job and returns 202. The processor drains the queue, reads the PDF through the mount, and
   writes page-marked text beside it.
3. The UI shows "Processing the file" and polls `GET /document` every 30s until the text object exists.
4. `POST /question` expands the question into search terms, runs ripgrep over the mounted text, ranks the
   passages, and streams the evidence-backed answer from the VPC Lambda through the REST API.

## Design notes

- Passages are line ranges built for one question and never persisted — there is nothing to keep in sync.
- Query terms are escaped before becoming a ripgrep PCRE2 alternation.
- Document status is derived from which S3 objects exist. There is no database or question persistence.
- The ripgrep Lambda layer is optional; without it the search falls back to the runtime's `grep`.
- Text extraction prefixes each page with a form feed, because `pdf-parse` joins pages with `\n\n`, which also
  occurs inside a page and so cannot mark a boundary.
- Stateless helpers are plain functions; classes are used where there is state or collaborators to inject.

## Prerequisites

- AWS SAM CLI, Node.js 22+, an AWS account in a region with the S3 Files resource types
- Python 3 only to serve the frontend locally
- `rg` locally if you want to run the retrieval command by hand (`brew install ripgrep`)

## Local checks

```bash
npm install && npm run lint && npm run typecheck && npm run build
```

## Deploy

```bash
sam build
sam deploy --guided \
  --parameter-overrides \
  LLMProvider=bedrock \
  LLMModel=amazon.nova-lite-v1:0 \
  FrontendOrigin=http://localhost:5173
```

For OpenAI or Anthropic, store `{"apiKey":"..."}` in Secrets Manager and pass `LLMSecretArn` plus the
provider and model. Bedrock needs no secret; the template grants the VPC question API access through the
Bedrock Runtime endpoint.

When using Bedrock, the test stack creates one Bedrock Runtime interface endpoint in the retrieval subnet.
The endpoint is private and does not require a NAT gateway. The VPC is intentionally single-AZ for the test
deployment, so it is not highly available.

To permanently delete the test stack and empty its versioned S3 buckets first:

```bash
npm run destroy
```

Pass a different stack name as the first argument when needed:

```bash
bash scripts/destroy.sh another-stack-name
```

This permanently deletes all objects in the stack's documents bucket before deleting the stack.

`RipgrepLayerArn` is optional — supply a layer containing the `rg` binary to use real ripgrep instead of the
`grep` fallback.

## Run the UI

```bash
cp frontend/config.example.js frontend/config.js
```

After the stack has been deployed, generate the frontend endpoint directly from its `ApiUrl` output:

```bash
npm run frontend:config
```

The default stack name is `db-less-rag-demo`. Pass a different name when needed:

```bash
npm run frontend:config -- another-stack-name
```

`npm run deploy` runs this update automatically after `sam deploy`, so the HTML app follows a recreated API
Gateway endpoint. The HTML also loads this file with a cache-busting query, so the browser picks up a new
endpoint without retaining an old cached configuration. The generated `frontend/config.js` is intentionally
ignored by git.

Then start the frontend:

```bash
npm run frontend:dev
```

That serves `frontend/` on <http://localhost:5173>, matching the default `FrontendOrigin`.
