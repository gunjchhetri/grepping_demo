# Grepping

Grepping lets users upload a PDF and ask questions about its contents. It converts the PDF into page-marked text,
searches it using `ripgrep`, and uses an LLM to answer from the most relevant passages.

## Why?

RAG is traditionally built around embeddings and vector databases. Documents are chunked, embedded, stored in a
vector database, and retrieved through semantic similarity.

With S3 now being accessible as a mounted file system, I wanted to explore a simpler question:

How far can RAG go with just a file system and fast text search?

Grepping replaces vector retrieval with `ripgrep`, a fast alternative to `grep`.

```text
PDF
 ↓
S3
 ↓
Page-marked text
 ↓
S3 mounted as a file system
 ↓
ripgrep
 ↓
Relevant passages
 ↓
LLM
 ↓
Answer + page references
```

The goal isn't to replace vector databases. Semantic search is still valuable when the question and source use very
different language.

Instead, Grepping explores how effective a much simpler RAG architecture can be: files for storage, `ripgrep` for
retrieval, and an LLM for reasoning.

## How it works

### Saving a document

When a PDF is uploaded, the app reads it once and pulls out the text, line by line, the same way you'd see it on
the page. That text is saved as a plain `document.txt` file. This only happens once per document, right after
upload. Nothing here depends on what anyone will ask later.

### Answering a question

Every message is checked first: is this a greeting, or a real question about the document?

- A greeting gets a reply right away. No file is searched.
- A real question is searched for. The app looks through `document.txt` line by line for words related to the
  question (using `ripgrep`, the same idea as the `grep` command but faster), gathers the matching lines together
  with a bit of surrounding text so each one reads as a full thought, and keeps the best few of those. If nothing
  matched, it tries again with a wider set of words before giving up.

Only those found passages are shown to the LLM, and it's told to answer using nothing else. It also has to quote
the exact sentence it used as proof. If that quote isn't a real, exact match in the passages, the app throws the
answer away and says it doesn't have enough information, rather than risk showing a made-up answer.

## Run locally

Prerequisites: Node.js 22+, the AWS SAM CLI, the AWS CLI with credentials configured, and an AWS account with the S3
Files resource types.

```bash
npm install
npm run deploy
npm run frontend:dev
```

`npm run deploy` builds the stack, deploys it, and writes the frontend API configuration. The default settings live
in `samconfig.toml`:

```text
LLMProvider=bedrock
LLMModel=amazon.nova-pro-v1:0
```

Open <http://localhost:5173>.

## Technical consideration

The stack reaches Amazon Bedrock through a private VPC endpoint and deliberately has no NAT Gateway. The deployment
therefore works with Bedrock but cannot call OpenAI, Anthropic/Claude, or other public LLM APIs directly. Supporting
those requires an outbound internet path and the provider API key in Secrets Manager.
Also don't forget to destroy the stack as vpc endpoint has a cost asociated to it.
