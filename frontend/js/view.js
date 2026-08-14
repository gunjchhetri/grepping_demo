import { icon } from "./icons.js";

const STATUS_LABELS = {
  READY: "Ready to ask",
  UPLOADING: "Waiting for processing",
  PROCESSING: "Extracting text…",
  FAILED: "Processing failed",
};

/** Owns every DOM read and write so app.js can stay about state and flow. */
export class View {
  constructor() {
    this.elements = {
      shell: document.querySelector(".shell"),
      uploadCard: document.getElementById("upload-card"),
      fileInput: document.getElementById("file-input"),
      documentList: document.getElementById("document-list"),
      docCount: document.getElementById("doc-count"),
      questionInput: document.getElementById("question-input"),
      askButton: document.getElementById("ask-button"),
      askIcon: document.querySelector(".ask-icon"),
      activeDoc: document.getElementById("active-doc"),
      answerArea: document.getElementById("answer-area"),
      debugCard: document.getElementById("debug-card"),
      debugToggle: document.getElementById("debug-toggle"),
      debugChevron: document.getElementById("debug-chevron"),
      timeline: document.getElementById("timeline"),
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
    this.elements.askIcon.innerHTML = icon(busy ? "loader" : "message");
    this.elements.askIcon.classList.toggle("spin", busy);
  }

  setAskEnabled(enabled) {
    this.elements.askButton.disabled = !enabled;
  }

  /** Updates the one-line hint under the chat bar to reflect the selected document. */
  setActiveDoc(record) {
    const hint = this.elements.activeDoc;

    if (!record) {
      hint.textContent = "No document selected.";

      return;
    }

    if (record.status === "READY") {
      hint.replaceChildren("Talking to ", boldSpan(record.fileName), ".");

      return;
    }

    hint.replaceChildren(boldSpan(record.fileName), ` — ${STATUS_LABELS[record.status] ?? record.status}`);
  }

  /** Redraws the selectable document list. */
  renderDocuments(documents, selectedId, onSelect) {
    const list = this.elements.documentList;

    this.elements.docCount.textContent = String(documents.length);
    list.replaceChildren();

    if (documents.length === 0) {
      const empty = document.createElement("div");

      empty.className = "empty-docs";
      empty.textContent = "No documents yet. Upload a PDF to get started.";
      list.append(empty);

      return;
    }

    for (const record of documents) {
      list.append(this.documentRow(record, selectedId, onSelect));
    }
  }

  documentRow(record, selectedId, onSelect) {
    const row = document.createElement("button");
    const fileIcon = document.createElement("div");
    const meta = document.createElement("div");
    const name = document.createElement("strong");
    const status = document.createElement("span");
    const badge = document.createElement("span");

    row.type = "button";
    row.className = `document-row${record.documentId === selectedId ? " selected" : ""}`;
    row.disabled = record.status !== "READY";
    row.addEventListener("click", () => onSelect(record.documentId));

    fileIcon.className = "file-icon";
    fileIcon.innerHTML = icon("file");

    meta.className = "document-meta";
    name.textContent = record.fileName;
    status.textContent = record.errorMessage ?? STATUS_LABELS[record.status] ?? record.status;
    meta.append(name, status);

    badge.className = `status-badge ${record.status.toLowerCase()}`;
    badge.textContent = record.status;

    row.append(fileIcon, meta, badge);

    return row;
  }

  /** Draws the answer and its sources, or clears the area when there is nothing to show. */
  renderAnswer(answer, sources) {
    const area = this.elements.answerArea;

    area.replaceChildren();

    if (!answer) {
      return;
    }

    const heading = document.createElement("div");
    const kicker = document.createElement("span");
    const grounded = document.createElement("span");
    const text = document.createElement("p");

    heading.className = "answer-heading";
    kicker.className = "answer-kicker";
    kicker.textContent = "Answer";
    grounded.className = "grounded-label";
    grounded.innerHTML = '<span class="status-dot"></span>';
    grounded.append("grounded");
    heading.append(kicker, grounded);

    text.className = "answer-text";
    text.textContent = answer;
    area.append(heading, text);

    if (sources.length === 0) {
      return;
    }

    const wrapper = document.createElement("div");
    const label = document.createElement("p");

    wrapper.className = "sources";
    label.className = "eyebrow";
    label.textContent = "Sources";
    wrapper.append(label);

    for (const source of sources) {
      const card = document.createElement("div");
      const pages = document.createElement("span");
      const id = document.createElement("code");
      const excerpt = document.createElement("p");

      card.className = "source-card";
      pages.textContent = `p. ${source.pageNumbers.join(", ")}`;
      id.textContent = source.id;
      excerpt.textContent = `${source.text.slice(0, 180)}…`;
      card.append(pages, id, excerpt);
      wrapper.append(card);
    }

    area.append(wrapper);
  }

  /** Draws the retrieval trace, mirroring the stages the backend reports. */
  renderDebug(debug, open) {
    const card = this.elements.debugCard;
    const timeline = this.elements.timeline;

    card.hidden = !debug;

    if (!debug) {
      return;
    }

    this.elements.debugChevron.textContent = open ? "▴" : "▾";
    timeline.hidden = !open;
    timeline.replaceChildren();

    if (!open) {
      return;
    }

    const stages = [
      ["Question", debug.question],
      ["Query expansion", Object.values(debug.queryTerms).flat().join(" · ") || "No terms generated"],
      ["ripgrep matches", `${debug.matches.length} line matches`],
      ["Grouped passages", `${debug.groups.length} local groups → ${debug.candidates.length} candidates`],
      [
        "Lexical scoring",
        debug.candidates
          .slice(0, 3)
          .map((candidate) => `${candidate.id} (${candidate.lexicalScore})`)
          .join(" · ") || "No candidates",
      ],
      ["LLM reranking", `${debug.selectedPassages.length} selected`],
    ];

    stages.forEach(([label, detail], index) => {
      const row = document.createElement("div");
      const marker = document.createElement("div");
      const content = document.createElement("div");
      const title = document.createElement("div");
      const body = document.createElement("div");

      row.className = "timeline-row";
      marker.className = "timeline-marker";
      marker.innerHTML = icon(index === stages.length - 1 ? "sparkles" : "check", 14);
      content.className = "timeline-content";
      title.className = "timeline-label";
      title.textContent = label;
      body.className = "timeline-detail";
      body.textContent = detail;
      content.append(title, body);
      row.append(marker, content);
      timeline.append(row);
    });

    if (debug.selectedPassages.length === 0) {
      return;
    }

    const selected = document.createElement("div");
    const label = document.createElement("p");

    selected.className = "selected-panel";
    label.textContent = "Selected sources";
    selected.append(label);

    for (const passage of debug.selectedPassages) {
      const pill = document.createElement("div");

      pill.className = "source-pill";
      pill.textContent = `p. ${passage.pageNumbers.join(", ")} · ${passage.id}`;
      selected.append(pill);
    }

    timeline.append(selected);
  }
}

function boldSpan(value) {
  const strong = document.createElement("b");

  strong.textContent = value;

  return strong;
}
