import { ApiClient } from "./api.js";
import { Icons } from "./icons.js";
import { Session } from "./session.js";
import { View } from "./view.js";

/** Wires the view to the API: upload a PDF, pick one, ask it a question. */
export class App {
  constructor(session = new Session(), icons = new Icons(), view = new View()) {
    this.session = session;
    this.icons = icons;
    this.view = view;
    this.userId = session.userId();
    this.api = new ApiClient(this.userId);
    this.documents = [];
    this.selectedId = "";
    this.busy = false;
  }

  start() {
    this.icons.renderStatic();
    this.view.setSessionId(this.session.shorten(this.userId));
    this.render();
    this.bindEvents();
    void this.refreshDocuments();
  }

  bindEvents() {
    const { uploadCard, fileInput, questionInput, askButton, resetSession } = this.view.elements;

    uploadCard.addEventListener("click", () => fileInput.click());
    uploadCard.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadCard.classList.add("dragover");
    });
    uploadCard.addEventListener("dragleave", () => uploadCard.classList.remove("dragover"));
    uploadCard.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadCard.classList.remove("dragover");
      this.handleFile(event.dataTransfer?.files?.[0]);
    });

    fileInput.addEventListener("change", () => {
      this.handleFile(fileInput.files?.[0]);
      fileInput.value = "";
    });

    questionInput.addEventListener("input", () => {
      this.autoGrow(questionInput);
      this.render();
    });
    questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.ask();
      }
    });
    askButton.addEventListener("click", () => void this.ask());
    resetSession.addEventListener("click", () => this.switchSession());
  }

  handleFile(file) {
    if (file) {
      void this.upload(file);
    }
  }

  switchSession() {
    this.userId = this.session.reset();
    this.api = new ApiClient(this.userId);
    this.documents = [];
    this.selectedId = "";

    this.view.setSessionId(this.session.shorten(this.userId));
    this.view.renderAnswer("", []);
    this.view.setNotice("Started a fresh session. Earlier documents stay under the old id.");
    this.render();
    void this.refreshDocuments();
  }

  async refreshDocuments() {
    try {
      this.documents = await this.api.listDocuments();

      if (!this.selectedDocument()) {
        this.selectedId = this.documents.find((record) => record.status === "READY")?.documentId ?? "";
      }

      this.render();
    } catch (cause) {
      this.view.setNotice(ApiClient.describeError(cause, "Could not load documents"));
    }
  }

  async upload(file) {
    this.setBusy(true);
    this.view.setNotice(`Uploading ${file.name}…`);

    try {
      const ticket = await this.api.createUpload(file.type || "application/pdf");

      await this.api.uploadToS3(ticket.uploadUrl, file, (percent) =>
        this.view.setNotice(`Uploading ${file.name}… ${percent}%`),
      );
      await this.api.startProcessing(ticket.documentId, ticket.key);
      this.view.setNotice("Uploaded to S3. Extracting text…");

      await this.api.waitForDocument(ticket.documentId);
      this.selectedId = ticket.documentId;
      await this.refreshDocuments();
      this.view.setNotice(`${file.name} is ready. Ask it a question.`);
      this.view.elements.questionInput.focus();
    } catch (cause) {
      this.view.setNotice(ApiClient.describeError(cause, "Upload failed"));
    } finally {
      this.setBusy(false);
    }
  }

  async ask() {
    const record = this.selectedDocument();
    const question = this.view.elements.questionInput.value.trim();

    if (record?.status !== "READY" || !question || this.busy) {
      return;
    }

    this.setBusy(true);
    this.view.renderAnswer("", []);
    this.view.setNotice("Running ripgrep over the document…");

    try {
      const { jobId } = await this.api.ask(record.documentId, question);

      this.view.setNotice("Passages retrieved. Waiting for the model…");

      const result = await this.api.waitForAnswer(jobId);

      this.view.renderAnswer(result.answer, result.sources ?? []);
      this.view.setNotice("Answer grounded in passages from the document.");
    } catch (cause) {
      this.view.setNotice(ApiClient.describeError(cause, "Question failed"));
    } finally {
      this.setBusy(false);
    }
  }

  render() {
    this.view.renderDocuments(this.documents, this.selectedId, (documentId) => this.select(documentId));
    this.view.setActiveDoc(this.selectedDocument());
    this.view.setAskEnabled(
      !this.busy && this.selectedDocument()?.status === "READY" && this.view.elements.questionInput.value.trim() !== "",
    );
  }

  select(documentId) {
    this.selectedId = documentId;
    this.render();
    this.view.elements.questionInput.focus();
  }

  setBusy(busy) {
    this.busy = busy;
    this.view.setBusy(busy);
    this.render();
  }

  selectedDocument() {
    return this.documents.find((record) => record.documentId === this.selectedId);
  }

  autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}

new App().start();
