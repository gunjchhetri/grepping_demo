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
  config.ts              every environment variable, read in one place
  types.ts               domain types
  user-id.ts             the browser-minted UUID that namespaces each visitor
  handlers/              Lambda entry points, thin: parse, delegate, respond
  http/                  request parsing and JSON responses
  storage/               S3 keys, the S3 client, and the S3 Files mount
  documents/             upload, listing, and PDF text extraction
  retrieval/             the ripgrep pipeline
  llm/                   the single LangChain provider/model service
```

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
processing/<userId>/<documentId>.json
llm-requests/<userId>/<jobId>.json
llm-responses/<userId>/<jobId>.json
```

Opening the app elsewhere gives you a new UUID and an empty library. This is a namespace, not authentication:
the API is unauthenticated, so anyone with an id can read that namespace. Do not put real data in this demo.

## How a question flows

1. `POST /documents/upload-url` returns a presigned URL; the browser PUTs the PDF straight to S3.
2. `POST /documents/process` writes a marker object. EventBridge invokes the PDF processor, which reads the
   PDF through the mount and writes page-marked text beside it.
3. The UI polls `GET /documents` until the text object exists.
4. `POST /questions` expands the question into search terms, runs ripgrep over the mounted text, ranks the
   passages, and writes a request object.
5. The request object triggers the worker, which asks the model to answer from those passages and writes the
   answer. The UI polls `GET /questions/{jobId}` until it lands.

Only `llm-requests/` triggers the worker, so writing the answer cannot recurse.

## Design notes

- Passages are line ranges built for one question and never persisted — there is nothing to keep in sync.
- Query terms are escaped before becoming a ripgrep PCRE2 alternation.
- Document and job status are derived from which S3 objects exist. There is no database anywhere.
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
provider and model. Bedrock needs no secret; the template grants the worker `bedrock:InvokeModel` for the
configured foundation model.

`RipgrepLayerArn` is optional — supply a layer containing the `rg` binary to use real ripgrep instead of the
`grep` fallback.

## Run the UI

```bash
cp frontend/config.example.js frontend/config.js
```

Put the `ApiUrl` stack output in `frontend/config.js`, then:

```bash
npm run frontend:dev
```

That serves `frontend/` on <http://localhost:5173>, matching the default `FrontendOrigin`.
