import { ApiClient, describeError } from "./api.js";
import { renderStaticIcons } from "./icons.js";
import { getUserId, resetUserId, shortenUserId } from "./session.js";
import { View } from "./view.js";

const state = { userId: getUserId(), documents: [], selectedId: "", busy: false };
const view = new View();
let api = new ApiClient(state.userId);

start();

function start() {
  renderStaticIcons();
  view.setSessionId(shortenUserId(state.userId));
  render();
  bindEvents();
  void refreshDocuments();
}

function bindEvents() {
  const { uploadCard, fileInput, questionInput, askButton, resetSession } = view.elements;

  uploadCard.addEventListener("click", () => fileInput.click());
  uploadCard.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadCard.classList.add("dragover");
  });
  uploadCard.addEventListener("dragleave", () => uploadCard.classList.remove("dragover"));
  uploadCard.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadCard.classList.remove("dragover");
    handleFile(event.dataTransfer?.files?.[0]);
  });

  fileInput.addEventListener("change", () => {
    handleFile(fileInput.files?.[0]);
    fileInput.value = "";
  });

  questionInput.addEventListener("input", () => {
    autoGrow(questionInput);
    render();
  });
  questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask();
    }
  });
  askButton.addEventListener("click", () => void ask());
  resetSession.addEventListener("click", () => switchSession());
}

function handleFile(file) {
  if (file) {
    void upload(file);
  }
}

function switchSession() {
  state.userId = resetUserId();
  state.documents = [];
  state.selectedId = "";
  api = new ApiClient(state.userId);

  view.setSessionId(shortenUserId(state.userId));
  view.renderAnswer("", []);
  view.setNotice("Started a fresh session. Earlier documents stay under the old id.");
  render();
  void refreshDocuments();
}

async function refreshDocuments() {
  try {
    state.documents = await api.listDocuments();

    if (!selectedDocument()) {
      state.selectedId = state.documents.find((record) => record.status === "READY")?.documentId ?? "";
    }

    render();
  } catch (cause) {
    view.setNotice(describeError(cause, "Could not load documents"));
  }
}

async function upload(file) {
  setBusy(true);
  view.setNotice(`Uploading ${file.name}…`);

  try {
    const ticket = await api.createUpload(file.type || "application/pdf");

    await api.uploadToS3(ticket.uploadUrl, file, (percent) => view.setNotice(`Uploading ${file.name}… ${percent}%`));
    await api.startProcessing(ticket.documentId, ticket.key);
    view.setNotice("Uploaded to S3. Extracting text…");

    await api.waitForDocument(ticket.documentId);
    state.selectedId = ticket.documentId;
    await refreshDocuments();
    view.setNotice(`${file.name} is ready. Ask it a question.`);
    view.elements.questionInput.focus();
  } catch (cause) {
    view.setNotice(describeError(cause, "Upload failed"));
  } finally {
    setBusy(false);
  }
}

async function ask() {
  const record = selectedDocument();
  const question = view.elements.questionInput.value.trim();

  if (record?.status !== "READY" || !question || state.busy) {
    return;
  }

  setBusy(true);
  view.renderAnswer("", []);
  view.setNotice("Running ripgrep over the document…");

  try {
    const { jobId } = await api.ask(record.documentId, question);

    view.setNotice("Passages retrieved. Waiting for the model…");

    const result = await api.waitForAnswer(jobId);

    view.renderAnswer(result.answer, result.sources ?? []);
    view.setNotice("Answer grounded in passages from the document.");
  } catch (cause) {
    view.setNotice(describeError(cause, "Question failed"));
  } finally {
    setBusy(false);
  }
}

function render() {
  view.renderDocuments(state.documents, state.selectedId, select);
  view.setActiveDoc(selectedDocument());
  view.setAskEnabled(
    !state.busy && selectedDocument()?.status === "READY" && view.elements.questionInput.value.trim() !== "",
  );
}

function select(documentId) {
  state.selectedId = documentId;
  render();
  view.elements.questionInput.focus();
}

function setBusy(busy) {
  state.busy = busy;
  view.setBusy(busy);
  render();
}

function selectedDocument() {
  return state.documents.find((record) => record.documentId === state.selectedId);
}

function autoGrow(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
