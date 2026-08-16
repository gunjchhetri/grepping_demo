/** Calls the HTTP API with axios, carrying this browser's user id on every request. */
export class ApiClient {
  static documentPoll = { intervalMs: 30000, attempts: 20 };

  constructor(userId, baseUrl = window.APP_CONFIG?.apiUrl ?? "http://localhost:3000") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.userId = userId;
    this.http = window.axios.create({
      baseURL: this.baseUrl,
      headers: { "content-type": "application/json", "x-user-id": userId },
    });
  }

  async listDocuments() {
    const { data } = await this.http.get("/document");

    return data.documents ?? [];
  }

  /** Starts an S3 multipart upload and returns the chunk size to use in the browser. */
  async createUpload(contentType) {
    const { data } = await this.http.post("/document/upload/init", { contentType });

    return data;
  }

  async createPartUpload(documentId, uploadId, partNumber) {
    const { data } = await this.http.post("/document/upload/part-url", { documentId, uploadId, partNumber });

    return data;
  }

  async completeUpload(documentId, uploadId, parts) {
    await this.http.post("/document/upload/complete", { documentId, uploadId, parts });
  }

  async abortUpload(documentId, uploadId) {
    await this.http.post("/document/upload/abort", { documentId, uploadId });
  }

  /** Queues extraction for an uploaded PDF. API Gateway enqueues it directly and returns 202. */
  async startProcessing(documentId) {
    await this.http.post("/document/process", { documentId });
  }

  /** Uploads 8 MB chunks directly to S3 and completes the multipart upload. */
  async uploadToS3(file, ticket, onProgress) {
    const totalParts = Math.ceil(file.size / ticket.partSize);
    const parts = [];
    let uploadedBytes = 0;

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const start = (partNumber - 1) * ticket.partSize;
      const end = Math.min(start + ticket.partSize, file.size);
      const chunk = file.slice(start, end);
      const { uploadUrl } = await this.createPartUpload(ticket.documentId, ticket.uploadId, partNumber);

      onProgress({ partNumber, totalParts, percent: Math.round((uploadedBytes / file.size) * 100) });

      const response = await window.axios.put(uploadUrl, chunk, {
        onUploadProgress: ({ loaded }) => {
          const percent = Math.round(((uploadedBytes + loaded) / file.size) * 100);

          onProgress({ partNumber, totalParts, percent });
        },
      });
      const etag = response.headers.etag;

      if (!etag) {
        throw new Error(`S3 did not return an ETag for part ${partNumber}`);
      }

      parts.push({ ETag: etag, PartNumber: partNumber });
      uploadedBytes = end;
      onProgress({ partNumber, totalParts, percent: Math.round((uploadedBytes / file.size) * 100) });
    }

    await this.completeUpload(ticket.documentId, ticket.uploadId, parts);
  }

  /** Polls the document list until extraction has produced the text object. */
  async waitForDocument(documentId) {
    return this.poll(ApiClient.documentPoll, async () => {
      const document = (await this.listDocuments()).find((record) => record.documentId === documentId);

      return document?.status === "READY" ? document : undefined;
    });
  }

  /** Streams the evidence-backed answer from the VPC Lambda through API Gateway. */
  async askStream(documentId, question, onChunk) {
    const response = await window.fetch(`${this.baseUrl}/question`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": this.userId },
      body: JSON.stringify({ documentId, question }),
    });

    if (!response.ok) {
      const payload = await response.text();
      let message = payload || "Question failed";

      try {
        message = JSON.parse(payload).message ?? message;
      } catch {
        // Keep the raw response when the backend did not return JSON.
      }

      throw new Error(message);
    }

    if (!response.body) {
      throw new Error("The browser does not support streamed responses");
    }

    const reader = response.body.getReader();
    const decoder = new window.TextDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const remainder = decoder.decode();

        if (remainder) {
          onChunk(remainder);
        }

        return;
      }

      const chunk = decoder.decode(value, { stream: true });

      if (chunk) {
        onChunk(chunk);
      }
    }
  }

  /** Repeats `attempt` until it returns a value, or gives up. */
  async poll({ intervalMs, attempts }, attempt) {
    for (let index = 0; index < attempts; index += 1) {
      const result = await attempt();

      if (result) {
        return result;
      }

      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }

    throw new Error("Timed out waiting for the backend");
  }

  /** Pulls a useful message out of an axios error. */
  static describeError(error, fallback) {
    return error?.response?.data?.message ?? error?.message ?? fallback;
  }
}
