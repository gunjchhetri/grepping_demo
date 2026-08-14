import { Icons } from "./icons.js";

/** Owns every DOM read and write, so app.js is only about state and flow. */
export class View {
  static statusLabels = { PROCESSING: "Extracting text…", READY: "Ready to ask" };

  constructor(icons = new Icons()) {
    this.icons = icons;
    this.elements = {
      uploadCard: document.getElementById("upload-card"),
      fileInput: document.getElementById("file-input"),
      documentList: document.getElementById("document-list"),
      docCount: document.getElementById("doc-count"),
      questionInput: document.getElementById("question-input"),
      askButton: document.getElementById("ask-button"),
      askIcon: document.querySelector(".ask-icon"),
      activeDoc: document.getElementById("active-doc"),
      answerArea: document.getElementById("answer-area"),
      notice: document.getElementById("notice"),
      sessionId: document.getElementById("session-id"),
      resetSession: document.getElementById("reset-session"),
    };
  }

  setNotice(message) {
    this.elements.notice.textContent = message;
  }

  setSessionId(text) {
    this.elements.sessionId.textContent = text;
  }

  setBusy(busy) {
    this.elements.askIcon.innerHTML = this.icons.get(busy ? "loader" : "message");
    this.elements.askIcon.classList.toggle("spin", busy);
  }

  setAskEnabled(enabled) {
    this.elements.askButton.disabled = !enabled;
  }

  /** One-line hint under the chat bar naming the document being talked to. */
  setActiveDoc(record) {
    const hint = this.elements.activeDoc;

    if (!record) {
      hint.textContent = "No document selected.";
    } else if (record.status === "READY") {
      hint.replaceChildren("Talking to ", this.bold(record.fileName), ".");
    } else {
      hint.replaceChildren(this.bold(record.fileName), ` — ${View.statusLabels[record.status] ?? record.status}`);
    }
  }

  /** Redraws the selectable document list. */
  renderDocuments(documents, selectedId, onSelect) {
    this.elements.docCount.textContent = String(documents.length);

    if (documents.length === 0) {
      this.elements.documentList.replaceChildren(this.element("div", "empty-docs", "No documents yet."));

      return;
    }

    this.elements.documentList.replaceChildren(
      ...documents.map((record) => this.documentRow(record, selectedId, onSelect)),
    );
  }

  documentRow(record, selectedId, onSelect) {
    const row = document.createElement("button");
    const fileIcon = this.element("div", "file-icon");
    const meta = this.element("div", "document-meta");

    row.type = "button";
    row.className = `document-row${record.documentId === selectedId ? " selected" : ""}`;
    row.disabled = record.status !== "READY";
    row.addEventListener("click", () => onSelect(record.documentId));

    fileIcon.innerHTML = this.icons.get("file");
    meta.append(
      this.element("strong", "", record.fileName),
      this.element("span", "", View.statusLabels[record.status] ?? record.status),
    );
    row.append(fileIcon, meta, this.element("span", `status-badge ${record.status.toLowerCase()}`, record.status));

    return row;
  }

  /** Draws the answer and the passages it was grounded in. */
  renderAnswer(answer, sources) {
    const area = this.elements.answerArea;

    area.replaceChildren();

    if (!answer) {
      return;
    }

    const heading = this.element("div", "answer-heading");
    const grounded = this.element("span", "grounded-label");

    grounded.innerHTML = '<span class="status-dot"></span>';
    grounded.append("grounded");
    heading.append(this.element("span", "answer-kicker", "Answer"), grounded);
    area.append(heading, this.element("p", "answer-text", answer));

    if (sources.length === 0) {
      return;
    }

    const wrapper = this.element("div", "sources");

    wrapper.append(this.element("p", "eyebrow", "Sources"));

    for (const source of sources) {
      const card = this.element("div", "source-card");

      card.append(
        this.element("span", "", `p. ${source.pageNumbers.join(", ")}`),
        this.element("p", "", `${source.text.slice(0, 180)}…`),
      );
      wrapper.append(card);
    }

    area.append(wrapper);
  }

  element(tag, className = "", text = "") {
    const node = document.createElement(tag);

    node.className = className;
    node.textContent = text;

    return node;
  }

  bold(value) {
    return this.element("b", "", value);
  }
}
