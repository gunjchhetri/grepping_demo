// The bootstrap script cache-busts app.js; pass that same query to its module imports so a
// changed view.js cannot remain cached alongside a newer app.js.
const moduleQuery = new window.URL(import.meta.url).search;
const [{ ApiClient }, { Icons }, { Session }, { View }] = await Promise.all([
  import(`./api.js${moduleQuery}`),
  import(`./icons.js${moduleQuery}`),
  import(`./session.js${moduleQuery}`),
  import(`./view.js${moduleQuery}`),
]);

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
    this.messages = [];
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
    this.messages = [];

    this.view.setSessionId(this.session.shorten(this.userId));
    this.view.renderConversation(this.messages);
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
    this.view.setUploadStatus("Preparing multipart upload…", 0);
    this.view.setNotice(`Preparing ${file.name}…`);
    let ticket;

    try {
      ticket = await this.api.createUpload(file.type || "application/pdf");

      await this.api.uploadToS3(file, ticket, ({ partNumber, totalParts, percent }) => {
        this.view.setUploadStatus(`Uploading part ${partNumber} of ${totalParts}`, percent);
        this.view.setNotice(`Uploading ${file.name} — part ${partNumber} of ${totalParts} (${percent}%)`);
      });
      this.view.setUploadStatus("Upload complete", 100);
      this.view.setNotice("Finalizing upload…");

      await this.api.startProcessing(ticket.documentId);
      this.view.setUploadStatus("Processing PDF…", 100);
      this.view.setNotice("Processing PDF text…");
      await this.refreshDocuments();

      await this.api.waitForDocument(ticket.documentId);
      this.selectedId = ticket.documentId;
      await this.refreshDocuments();
      this.view.setUploadStatus("Ready", 100);
      this.view.setNotice(`${file.name} is ready. Ask it a question.`);
      this.view.elements.questionInput.focus();
    } catch (cause) {
      if (ticket) {
        await this.api.abortUpload(ticket.documentId, ticket.uploadId).catch(() => undefined);
      }

      this.view.setUploadStatus("Upload failed", 0);
      this.view.setNotice(ApiClient.describeError(cause, "Upload failed"));
    } finally {
      this.setBusy(false);
    }
  }

  async ask() {
    const record = this.selectedDocument();
    const question = this.view.elements.questionInput.value.trim();

    if (!question || this.busy) {
      return;
    }

    this.setBusy(true);

    const userMessage = { role: "user", text: question };
    const assistantMessage = { role: "assistant", text: "" };

    this.messages.push(userMessage, assistantMessage);
    this.view.renderConversation(this.messages);
    this.view.setNotice("Generating a response…");

    try {
      let answer = "";

      this.view.setNotice("Generating an answer…");
      await this.api.askStream(record?.documentId ?? "", question, (chunk) => {
        answer += chunk;
        assistantMessage.text = answer;
        this.view.renderConversation(this.messages);
      });

      this.view.setNotice(
        answer.startsWith("The PDF does not provide enough information")
          ? "The PDF does not provide information on that topic."
          : "Answer ready.",
      );
    } catch (cause) {
      if (!assistantMessage.text) {
        this.messages = this.messages.filter((message) => message !== assistantMessage);

        this.view.renderConversation(this.messages);
      }

      this.view.setNotice(ApiClient.describeError(cause, "Question failed"));
    } finally {
      this.setBusy(false);
    }
  }

  render() {
    this.view.renderDocuments(this.documents, this.selectedId, (documentId) => this.select(documentId));
    this.view.setActiveDoc(this.selectedDocument());
    this.view.setAskEnabled(!this.busy && this.view.elements.questionInput.value.trim() !== "");
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
