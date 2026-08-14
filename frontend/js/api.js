const DOCUMENT_POLL_INTERVAL_MS = 1500;
const DOCUMENT_POLL_ATTEMPTS = 80;
const JOB_POLL_INTERVAL_MS = 650;
const JOB_POLL_ATTEMPTS = 20;

/** Thin axios wrapper over the HTTP API. Every call carries the session's user id. */
export class ApiClient {
  constructor(userId, baseUrl = window.APP_CONFIG?.apiUrl ?? "http://localhost:3000") {
    this.userId = userId;
    this.http = window.axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      headers: { "content-type": "application/json", "x-user-id": userId },
    });
  }

  /** Lists the documents stored under this session's prefix. */
  async listDocuments() {
    const response = await this.http.get("/documents");

    return response.data.documents ?? [];
  }

  /** Asks the backend for a short-lived presigned S3 PUT URL. */
  async createUpload(contentType) {
    const response = await this.http.post("/documents/upload-url", { contentType });

    return response.data;
  }

  /**
   * Uploads the PDF straight to S3. This request is deliberately made with a bare axios
   * instance: the presigned URL is signed for content-type only, so no app headers go with it.
   */
  async uploadToS3(uploadUrl, file, onProgress) {
    await window.axios.put(uploadUrl, file, {
      headers: { "content-type": "application/pdf" },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  }

  /** Tells the backend the upload landed, which starts asynchronous text extraction. */
  async startProcessing(documentId, key) {
    await this.http.post("/documents/process", { documentId, key });
  }

  /** Polls the document list until the given document is READY (or fails / times out). */
  async waitForDocument(documentId, onUpdate) {
    for (let attempt = 0; attempt < DOCUMENT_POLL_ATTEMPTS; attempt += 1) {
      const document = (await this.listDocuments()).find((record) => record.documentId === documentId);

      onUpdate(document);

      if (document?.status === "READY") {
        return document;
      }

      if (document?.status === "FAILED") {
        throw new Error("Document processing failed");
      }

      if (attempt < DOCUMENT_POLL_ATTEMPTS - 1) {
        await pause(DOCUMENT_POLL_INTERVAL_MS);
      }
    }

    throw new Error("Document processing timed out");
  }

  /** Submits a question. Retrieval runs inline; the answer is fetched by polling the job. */
  async ask(documentId, question) {
    const response = await this.http.post("/questions", { documentId, question });

    return response.data;
  }

  /** Fetches one job's current state. 202 means the answer is not ready yet. */
  async getJob(jobId) {
    const response = await this.http.get(`/questions/${jobId}`, {
      validateStatus: (status) => status === 200 || status === 202,
    });

    return response.data;
  }

  /** Polls a job until it leaves PROCESSING (or the attempt budget runs out). */
  async waitForJob(jobId) {
    let result = await this.getJob(jobId);

    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS && result.status === "PROCESSING"; attempt += 1) {
      await pause(JOB_POLL_INTERVAL_MS);
      result = await this.getJob(jobId);
    }

    return result;
  }
}

function pause(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** Pulls a useful message out of an axios error. */
export function describeError(error, fallback) {
  return error?.response?.data?.message ?? error?.message ?? fallback;
}
