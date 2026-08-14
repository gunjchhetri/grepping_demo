import { ApiClient, describeError } from "./api.js";
import { renderStaticIcons } from "./icons.js";
import { getUserId, resetUserId, shortenUserId } from "./session.js";
import { View } from "./view.js";

const state = {
  userId: getUserId(),
  documents: [],
  selectedId: "",
  debug: undefined,
  debugOpen: false,
  busy: false,
};
const view = new View();
let api = new ApiClient(state.userId);

start();

function start() {
  renderStaticIcons();
  view.setSessionId(shortenUserId(state.userId));
  renderLibrary();
  bindEvents();
  void refreshDocuments();
}

function bindEvents() {
  const { uploadCard, fileInput, questionInput, askButton, debugToggle, resetSession } = view.elements;

  uploadCard.addEventListener("click", () => fileInput.click());
  uploadCard.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadCard.classList.add("dragover");
  });
  uploadCard.addEventListener("dragleave", () => uploadCard.classList.remove("dragover"));
  uploadCard.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadCard.classList.remove("dragover");

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      void upload(file);
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];

    if (file) {
      void upload(file);
    }

    fileInput.value = "";
  });

  questionInput.addEventListener("input", () => {
    autoGrow(questionInput);
    syncAskButton();
  });
  questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask();
    }
  });
  askButton.addEventListener("click", () => void ask());

  debugToggle.addEventListener("click", () => {
    state.debugOpen = !state.debugOpen;
    view.renderDebug(state.debug, state.debugOpen);
  });

  resetSession.addEventListener("click", () => switchSession());
}

function switchSession() {
  state.userId = resetUserId();
  api = new ApiClient(state.userId);
  state.documents = [];
  state.selectedId = "";
  state.debug = undefined;

  view.setSessionId(shortenUserId(state.userId));
  view.renderAnswer("", []);
  view.renderDebug(undefined, false);
  renderLibrary();
  view.setNotice("Started a fresh session. Previous documents stay under the old id.");
  void refreshDocuments();
}

async function refreshDocuments() {
  try {
    state.documents = await api.listDocuments();

    if (!selectedDocument()) {
      state.selectedId = state.documents.find((record) => record.status === "READY")?.documentId ?? "";
    }

    renderLibrary();
  } catch (error) {
    view.setNotice(describeError(error, "Could not load documents"));
  }
}

async function upload(file) {
  setBusy(true);
  view.setNotice(`Uploading ${file.name}…`);

  try {
    const ticket = await api.createUpload(file.type || "application/pdf");

    await api.uploadToS3(ticket.uploadUrl, file, (percent) => view.setNotice(`Uploading ${file.name}… ${percent}%`));
    await api.startProcessing(ticket.documentId, ticket.key);

    upsertDocument({ documentId: ticket.documentId, fileName: file.name, status: "PROCESSING" });
    view.setNotice("Uploaded to S3. Extracting text…");

    await api.waitForDocument(ticket.documentId, (document) => {
      if (!document) {
        view.setNotice("Upload complete. Waiting for the S3 processing event…");

        return;
      }

      upsertDocument({ ...document, fileName: document.fileName || file.name });
      view.setNotice(
        document.status === "READY"
          ? `${file.name} is ready. Ask it a question.`
          : "PDF uploaded. Text extraction is still processing…",
      );
    });

    state.selectedId = ticket.documentId;
    await refreshDocuments();
    view.elements.questionInput.focus();
  } catch (error) {
    view.setNotice(describeError(error, "Upload failed"));
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
  view.setNotice("Generating query terms and running ripgrep…");

  try {
    const started = await api.ask(record.documentId, question);

    state.debug = started.debug;
    view.renderDebug(state.debug, state.debugOpen);
    view.setNotice("Retrieval done. Waiting for the model's answer…");

    const result = await api.waitForJob(started.jobId);

    if (result.status === "FAILED") {
      throw new Error(result.errorMessage ?? "LLM job failed");
    }

    if (result.status === "PROCESSING") {
      throw new Error("The answer is taking longer than expected. Try asking again.");
    }

    view.renderAnswer(result.answer ?? "No answer returned.", result.selectedPassages ?? []);
    state.debug = result.retrievalDebug ?? state.debug;
    view.renderDebug(state.debug, state.debugOpen);
    view.setNotice("Answer grounded in passages from the document.");
  } catch (error) {
    view.setNotice(describeError(error, "Question failed"));
  } finally {
    setBusy(false);
  }
}

function select(documentId) {
  state.selectedId = documentId;
  renderLibrary();
  view.elements.questionInput.focus();
}

function upsertDocument(record) {
  state.documents = [record, ...state.documents.filter((item) => item.documentId !== record.documentId)];
  renderLibrary();
}

function renderLibrary() {
  view.renderDocuments(state.documents, state.selectedId, select);
  view.setActiveDoc(selectedDocument());
  syncAskButton();
}

function syncAskButton() {
  const record = selectedDocument();
  const hasQuestion = view.elements.questionInput.value.trim().length > 0;

  view.setAskEnabled(!state.busy && record?.status === "READY" && hasQuestion);
}

function setBusy(busy) {
  state.busy = busy;
  view.setBusy(busy);
  syncAskButton();
}

function selectedDocument() {
  return state.documents.find((record) => record.documentId === state.selectedId);
}

function autoGrow(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
