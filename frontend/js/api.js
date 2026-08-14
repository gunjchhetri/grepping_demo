/** Calls the HTTP API with axios, carrying this browser's user id on every request. */
export class ApiClient {
  static documentPoll = { intervalMs: 1500, attempts: 80 };
  static answerPoll = { intervalMs: 650, attempts: 30 };

  constructor(userId, baseUrl = window.APP_CONFIG?.apiUrl ?? "http://localhost:3000") {
    this.http = window.axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      headers: { "content-type": "application/json", "x-user-id": userId },
    });
  }

  async listDocuments() {
    const { data } = await this.http.get("/document");

    return data.documents ?? [];
  }

  /** Asks the backend for a short-lived presigned S3 PUT URL. */
  async createUpload(contentType) {
    const { data } = await this.http.post("/document/upload-url", { contentType });

    return data;
  }

  /**
   * Uploads the PDF straight to S3. Sent with a bare axios call on purpose: the URL is
   * signed for content-type only, so none of the app's own headers should travel with it.
   */
  async uploadToS3(uploadUrl, file, onProgress) {
    await window.axios.put(uploadUrl, file, {
      headers: { "content-type": "application/pdf" },
      onUploadProgress: ({ loaded, total }) => total && onProgress(Math.round((loaded / total) * 100)),
    });
  }

  /** Tells the backend the upload landed, which starts asynchronous text extraction. */
  async startProcessing(documentId, key) {
    await this.http.post("/document/process", { documentId, key });
  }

  /** Polls the document list until extraction has produced the text object. */
  async waitForDocument(documentId) {
    return this.poll(ApiClient.documentPoll, async () => {
      const document = (await this.listDocuments()).find((record) => record.documentId === documentId);

      return document?.status === "READY" ? document : undefined;
    });
  }

  /** Submits a question. Retrieval runs inline; the model answers asynchronously. */
  async ask(documentId, question) {
    const { data } = await this.http.post("/question", { documentId, question });

    return data;
  }

  /** Polls one question until the worker has written its answer. */
  async waitForAnswer(jobId) {
    return this.poll(ApiClient.answerPoll, async () => {
      const { data } = await this.http.get(`/question/${jobId}`, {
        validateStatus: (status) => status === 200 || status === 202,
      });

      return data.status === "COMPLETED" ? data : undefined;
    });
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
