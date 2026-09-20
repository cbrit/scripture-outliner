import {
  assertNever,
  type Document,
  type PinEdge,
  type ViewMode,
  type WordId,
} from "./types";
import {
  breaksForPassage,
  passageFromText,
  type BreakKind,
} from "./tokenize";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "./sample";
import {
  createDocument,
  createSegment,
  exactSegment,
  highlightDepthForWord,
  insertSegment,
  newestCoveringSegment,
  orderedSelection,
  removeSegment,
  selectionEquals,
  snippet,
  suggestedSummaryDepth,
  updateSegment,
} from "./segments";
import { clearDocument, loadDocument, saveDocument } from "./store";
import { exportOutlineMarkdown, outlineFilename } from "./exportMarkdown";

type Refs = {
  titleInput: HTMLInputElement;
  viewToggle: HTMLElement;
  headerActions: HTMLElement;
  importView: HTMLElement;
  importText: HTMLTextAreaElement;
  editor: HTMLElement;
  paneText: HTMLElement;
  paneOutline: HTMLElement;
  passage: HTMLElement;
  pinStart: HTMLButtonElement;
  pinEnd: HTMLButtonElement;
  outlineList: HTMLElement;
  outlineEmpty: HTMLElement;
  actionBar: HTMLElement;
  hint: HTMLElement;
  summaryDialog: HTMLDialogElement;
  summaryField: HTMLTextAreaElement;
};

const VIEW_MODES: readonly ViewMode[] = ["text", "split", "outline"];

export function mount(root: HTMLElement): void {
  root.innerHTML = shellHtml();
  const refs = bind(root);
  let doc = loadDocument();
  let extendFrom: WordId | null = null;
  let dragging: PinEdge | null = null;

  function persist(): void {
    if (doc) {
      saveDocument(doc);
    } else {
      clearDocument();
    }
  }

  function setDoc(next: Document | null): void {
    doc = next;
    persist();
    render();
  }

  function patchDoc(next: Document): void {
    doc = next;
    persist();
  }

  function render(): void {
    if (!doc) {
      refs.importView.hidden = false;
      refs.editor.hidden = true;
      refs.viewToggle.hidden = true;
      refs.headerActions.hidden = true;
      refs.titleInput.value = "";
      refs.titleInput.disabled = true;
      refs.actionBar.hidden = true;
      refs.hint.hidden = true;
      return;
    }
    refs.importView.hidden = true;
    refs.editor.hidden = false;
    refs.viewToggle.hidden = false;
    refs.headerActions.hidden = false;
    refs.titleInput.disabled = false;
    refs.titleInput.value = doc.passage.title;
    refs.editor.dataset.view = doc.viewMode;
    for (const button of refs.viewToggle.querySelectorAll("button")) {
      const mode = button.dataset.view;
      button.setAttribute("aria-pressed", String(mode === doc.viewMode));
    }
    renderPassage();
    renderOutline();
    renderActions();
    positionPins();
  }

  function renderPassage(): void {
    if (!doc) {
      return;
    }
    const existingCount = refs.passage.querySelectorAll(".word").length;
    if (existingCount !== doc.passage.words.length) {
      buildPassage();
    }
    const selection = doc.selection;
    const words = refs.passage.querySelectorAll<HTMLSpanElement>(".word");
    for (const el of words) {
      const id = Number(el.dataset.wordId);
      const selected =
        selection !== null && id >= selection.start && id <= selection.end;
      const depth = highlightDepthForWord(doc.segments, id);
      el.classList.toggle("selected", selected);
      el.classList.toggle("seg-0", depth === 0 && !selected);
      el.classList.toggle("seg-1", depth === 1 && !selected);
    }
  }

  function buildPassage(): void {
    if (!doc) {
      return;
    }
    refs.passage.replaceChildren();
    const breaks = breaksForPassage(doc.passage);
    for (const word of doc.passage.words) {
      appendBreak(refs.passage, breaks[word.id] ?? "space");
      const span = document.createElement("span");
      span.className = word.verseLabel ? "word verse" : "word";
      span.dataset.wordId = String(word.id);
      span.textContent = word.text;
      refs.passage.append(span);
    }
  }

  function renderOutline(): void {
    if (!doc) {
      return;
    }
    refs.outlineList.replaceChildren();
    refs.outlineEmpty.hidden = doc.segments.length > 0;
    for (const segment of doc.segments) {
      refs.outlineList.append(outlineRow(segment));
    }
  }

  function outlineRow(segment: NonNullable<Document["segments"][number]>): HTMLLIElement {
    const row = document.createElement("li");
    row.className = "outline-row";
    row.dataset.segmentId = segment.id;
    row.dataset.depth = String(segment.depth);
    if (
      doc &&
      doc.selection &&
      selectionEquals(doc.selection, segment.start, segment.end)
    ) {
      row.setAttribute("aria-current", "true");
    }

    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "outline-mark";
    mark.textContent = segment.depth === 0 ? "•" : "◦";
    mark.title = "Select this range";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "summary-input";
    input.value = segment.summary;
    input.placeholder = snippet(
      doc?.passage.words ?? [],
      segment.start,
      segment.end,
    );

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = "✕";
    remove.title = "Delete segment";

    const selectRange = (): void => {
      if (!doc) {
        return;
      }
      extendFrom = null;
      const nextView: ViewMode = doc.viewMode === "outline" ? "split" : doc.viewMode;
      patchDoc({
        ...doc,
        selection: { start: segment.start, end: segment.end },
        viewMode: nextView,
      });
      render();
    };

    mark.addEventListener("click", selectRange);
    row.addEventListener("click", (event) => {
      if (event.target === input || event.target === remove) {
        return;
      }
      selectRange();
    });
    input.addEventListener("input", () => {
      if (!doc) {
        return;
      }
      patchDoc({
        ...doc,
        segments: updateSegment(doc.segments, segment.id, {
          summary: input.value,
        }),
      });
    });
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!doc) {
        return;
      }
      patchDoc({
        ...doc,
        segments: removeSegment(doc.segments, segment.id),
      });
      render();
    });

    row.append(mark, input, remove);
    return row;
  }

  function renderActions(): void {
    if (!doc || !doc.selection) {
      refs.actionBar.hidden = true;
      refs.hint.hidden = !doc;
      return;
    }
    refs.hint.hidden = true;
    refs.actionBar.hidden = false;
    const matched = exactSegment(doc.segments, doc.selection);
    const del = refs.actionBar.querySelector("[data-delete]");
    if (del instanceof HTMLButtonElement) {
      del.disabled = !matched;
    }
  }

  function positionPins(): void {
    if (!doc || !doc.selection) {
      refs.pinStart.hidden = true;
      refs.pinEnd.hidden = true;
      return;
    }
    const startEl = wordElement(doc.selection.start);
    const endEl = wordElement(doc.selection.end);
    if (!startEl || !endEl) {
      refs.pinStart.hidden = true;
      refs.pinEnd.hidden = true;
      return;
    }
    const wrap = refs.passage.parentElement;
    if (!wrap) {
      return;
    }
    const origin = wrap.getBoundingClientRect();
    const startBox = startEl.getBoundingClientRect();
    const endBox = endEl.getBoundingClientRect();
    refs.pinStart.hidden = false;
    refs.pinEnd.hidden = false;
    refs.pinStart.style.left = `${startBox.left - origin.left}px`;
    refs.pinStart.style.top = `${startBox.top - origin.top}px`;
    refs.pinEnd.style.left = `${endBox.right - origin.left}px`;
    refs.pinEnd.style.top = `${endBox.bottom - origin.top}px`;
  }

  function wordElement(id: WordId): HTMLSpanElement | null {
    return refs.passage.querySelector(`[data-word-id="${id}"]`);
  }

  function nearestWordId(clientX: number, clientY: number): WordId | null {
    const words = refs.passage.querySelectorAll<HTMLSpanElement>(".word");
    let best: WordId | null = null;
    let bestDist = Infinity;
    for (const el of words) {
      const box = el.getBoundingClientRect();
      const x = clamp(clientX, box.left, box.right);
      const y = clamp(clientY, box.top, box.bottom);
      const dist = (clientX - x) ** 2 + (clientY - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(el.dataset.wordId);
      }
    }
    return best;
  }

  function onWordTap(wordId: WordId): void {
    if (!doc || dragging) {
      return;
    }
    if (extendFrom !== null && extendFrom !== wordId) {
      const anchor = extendFrom;
      extendFrom = null;
      patchDoc({
        ...doc,
        selection: orderedSelection(anchor, wordId),
      });
      render();
      return;
    }
    const covering = newestCoveringSegment(doc.segments, wordId);
    if (
      covering &&
      !selectionEquals(doc.selection, covering.start, covering.end)
    ) {
      extendFrom = null;
      patchDoc({
        ...doc,
        selection: { start: covering.start, end: covering.end },
      });
      render();
      return;
    }
    if (
      covering &&
      selectionEquals(doc.selection, covering.start, covering.end)
    ) {
      extendFrom = wordId;
      patchDoc({ ...doc, selection: { start: wordId, end: wordId } });
      render();
      return;
    }
    extendFrom = wordId;
    patchDoc({ ...doc, selection: { start: wordId, end: wordId } });
    render();
  }

  function applyPin(edge: PinEdge, wordId: WordId): void {
    if (!doc || !doc.selection) {
      return;
    }
    let { start, end } = doc.selection;
    switch (edge) {
      case "start":
        start = Math.min(wordId, end);
        break;
      case "end":
        end = Math.max(wordId, start);
        break;
      default: {
        const _exhaustive: never = edge;
        assertNever(_exhaustive);
      }
    }
    if (start === doc.selection.start && end === doc.selection.end) {
      positionPins();
      return;
    }
    extendFrom = null;
    patchDoc({ ...doc, selection: { start, end } });
    renderPassage();
    renderActions();
    positionPins();
  }

  function importTextAs(title: string, raw: string): void {
    const passage = passageFromText(title, raw);
    if (passage.words.length === 0) {
      refs.importText.focus();
      return;
    }
    extendFrom = null;
    setDoc(createDocument(passage));
  }

  function setView(mode: ViewMode): void {
    if (!doc) {
      return;
    }
    patchDoc({ ...doc, viewMode: mode });
    render();
    requestAnimationFrame(positionPins);
  }

  function addBullet(depth: 0 | 1): void {
    if (!doc || !doc.selection) {
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    if (existing) {
      patchDoc({
        ...doc,
        segments: updateSegment(doc.segments, existing.id, { depth }),
      });
      render();
      return;
    }
    patchDoc({
      ...doc,
      segments: insertSegment(
        doc.segments,
        createSegment(doc.selection, depth),
      ),
    });
    render();
  }

  function openSummary(): void {
    if (!doc || !doc.selection) {
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    refs.summaryField.value = existing?.summary ?? "";
    refs.summaryDialog.showModal();
    refs.summaryField.focus();
  }

  function saveSummary(): void {
    if (!doc || !doc.selection) {
      return;
    }
    const text = refs.summaryField.value;
    const existing = exactSegment(doc.segments, doc.selection);
    if (existing) {
      patchDoc({
        ...doc,
        segments: updateSegment(doc.segments, existing.id, { summary: text }),
      });
    } else {
      const depth = suggestedSummaryDepth(doc.segments, doc.selection);
      patchDoc({
        ...doc,
        segments: insertSegment(
          doc.segments,
          createSegment(doc.selection, depth, text),
        ),
      });
    }
    refs.summaryDialog.close();
    render();
  }

  function clearSelection(): void {
    if (!doc) {
      return;
    }
    extendFrom = null;
    patchDoc({ ...doc, selection: null });
    render();
  }

  function deleteSelectedSegment(): void {
    if (!doc || !doc.selection) {
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    if (!existing) {
      return;
    }
    patchDoc({
      ...doc,
      segments: removeSegment(doc.segments, existing.id),
    });
    render();
  }

  function exportOutline(): void {
    if (!doc) {
      return;
    }
    const markdown = exportOutlineMarkdown(doc);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outlineFilename(doc.passage.title);
    link.click();
    URL.revokeObjectURL(url);
    void navigator.clipboard?.writeText(markdown).catch(() => undefined);
  }

  function newDocument(): void {
    if (doc?.segments.length && !window.confirm("Replace the current document?")) {
      return;
    }
    extendFrom = null;
    refs.importText.value = "";
    setDoc(null);
  }

  refs.importView.querySelector("[data-import-submit]")?.addEventListener(
    "click",
    () => importTextAs("Untitled passage", refs.importText.value),
  );
  refs.importView.querySelector("[data-load-sample]")?.addEventListener(
    "click",
    () => {
      refs.importText.value = SAMPLE_TEXT;
      importTextAs(SAMPLE_TITLE, SAMPLE_TEXT);
    },
  );
  refs.titleInput.addEventListener("input", () => {
    if (!doc) {
      return;
    }
    patchDoc({
      ...doc,
      passage: { ...doc.passage, title: refs.titleInput.value },
    });
  });
  refs.viewToggle.addEventListener("click", (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const mode = button.dataset.view;
    if (mode === "text" || mode === "outline" || mode === "split") {
      setView(mode);
    }
  });
  root.querySelector("[data-export]")?.addEventListener("click", exportOutline);
  root.querySelector("[data-new]")?.addEventListener("click", newDocument);

  refs.passage.addEventListener("pointerdown", (event) => {
    if (dragging) {
      return;
    }
    const word = wordIdFromEvent(event);
    if (word === null) {
      return;
    }
    refs.passage.dataset.tapX = String(event.clientX);
    refs.passage.dataset.tapY = String(event.clientY);
    refs.passage.dataset.tapId = String(word);
  });
  refs.passage.addEventListener("pointerup", (event) => {
    const rawId = refs.passage.dataset.tapId;
    const tapX = Number(refs.passage.dataset.tapX);
    const tapY = Number(refs.passage.dataset.tapY);
    delete refs.passage.dataset.tapId;
    delete refs.passage.dataset.tapX;
    delete refs.passage.dataset.tapY;
    if (rawId === undefined || Number.isNaN(tapX) || Number.isNaN(tapY)) {
      return;
    }
    if (Math.hypot(event.clientX - tapX, event.clientY - tapY) > 14) {
      return;
    }
    onWordTap(Number(rawId));
  });

  bindPin(refs.pinStart, "start");
  bindPin(refs.pinEnd, "end");

  function bindPin(pin: HTMLButtonElement, edge: PinEdge): void {
    pin.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragging = edge;
      pin.setPointerCapture(event.pointerId);
    });
    pin.addEventListener("pointermove", (event) => {
      if (dragging !== edge) {
        return;
      }
      const wordId = nearestWordId(event.clientX, event.clientY);
      if (wordId !== null) {
        applyPin(edge, wordId);
      }
    });
    pin.addEventListener("pointerup", () => {
      dragging = null;
    });
    pin.addEventListener("pointercancel", () => {
      dragging = null;
    });
  }

  refs.actionBar.querySelector("[data-bullet]")?.addEventListener("click", () =>
    addBullet(0),
  );
  refs.actionBar.querySelector("[data-sub]")?.addEventListener("click", () =>
    addBullet(1),
  );
  refs.actionBar.querySelector("[data-summary]")?.addEventListener(
    "click",
    openSummary,
  );
  refs.actionBar.querySelector("[data-clear]")?.addEventListener(
    "click",
    clearSelection,
  );
  refs.actionBar.querySelector("[data-delete]")?.addEventListener(
    "click",
    deleteSelectedSegment,
  );

  refs.summaryDialog.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSummary();
  });
  refs.summaryDialog.querySelector("[data-summary-cancel]")?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      refs.summaryDialog.close();
    },
  );

  refs.paneText.addEventListener("scroll", () => positionPins(), {
    passive: true,
  });
  window.addEventListener("resize", () => positionPins());

  document.addEventListener(
    "touchmove",
    (event) => {
      if (dragging) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  render();
}

function bind(root: HTMLElement): Refs {
  return {
    titleInput: requireEl(root, ".title-input", HTMLInputElement),
    viewToggle: requireEl(root, "[data-view-toggle]", HTMLElement),
    headerActions: requireEl(root, ".header-actions", HTMLElement),
    importView: requireEl(root, "[data-import]", HTMLElement),
    importText: requireEl(root, "[data-import-text]", HTMLTextAreaElement),
    editor: requireEl(root, "[data-editor]", HTMLElement),
    paneText: requireEl(root, "[data-pane-text]", HTMLElement),
    paneOutline: requireEl(root, "[data-pane-outline]", HTMLElement),
    passage: requireEl(root, "[data-passage]", HTMLElement),
    pinStart: requireEl(root, "[data-pin-start]", HTMLButtonElement),
    pinEnd: requireEl(root, "[data-pin-end]", HTMLButtonElement),
    outlineList: requireEl(root, "[data-outline-list]", HTMLElement),
    outlineEmpty: requireEl(root, "[data-outline-empty]", HTMLElement),
    actionBar: requireEl(root, "[data-action-bar]", HTMLElement),
    hint: requireEl(root, "[data-hint]", HTMLElement),
    summaryDialog: requireEl(root, "[data-summary-dialog]", HTMLDialogElement),
    summaryField: requireEl(root, "[data-summary-field]", HTMLTextAreaElement),
  };
}

function shellHtml(): string {
  const viewButtons = VIEW_MODES.map((mode) => {
    const label = viewModeLabel(mode);
    return `<button type="button" data-view="${mode}">${label}</button>`;
  }).join("");
  return `
    <div class="shell">
      <header class="header">
        <div class="brand">
          <h1>Scripture Outliner</h1>
          <input class="title-input" type="text" placeholder="Untitled passage" />
        </div>
        <div class="view-toggle" data-view-toggle hidden>${viewButtons}</div>
        <div class="header-actions">
          <button type="button" class="secondary" data-export>Export</button>
          <button type="button" class="ghost" data-new>New</button>
        </div>
      </header>
      <main class="main">
        <section class="empty" data-import>
          <h2>Import a passage</h2>
          <p>Paste scripture (or any text). Select by tapping words — nothing is auto-outlined.</p>
          <textarea data-import-text placeholder="Paste passage text…"></textarea>
          <div class="empty-actions">
            <button type="button" data-import-submit>Import</button>
            <button type="button" class="secondary" data-load-sample>Load sample (Psalm 23 KJV)</button>
          </div>
        </section>
        <section class="editor" hidden data-editor data-view="split">
          <div class="panes">
            <div class="pane pane-text" data-pane-text>
              <div class="passage-wrap">
                <div class="passage" data-passage></div>
                <button type="button" class="pin pin-start" data-pin-start hidden aria-label="Selection start"></button>
                <button type="button" class="pin pin-end" data-pin-end hidden aria-label="Selection end"></button>
              </div>
              <p class="hint" data-hint>Tap a word to select. Tap a second word to extend. Drag the pins to snap.</p>
            </div>
            <div class="pane pane-outline" data-pane-outline>
              <ul class="outline-list" data-outline-list></ul>
              <p class="outline-empty" data-outline-empty>No segments yet. Select words, then Bullet or Sub.</p>
            </div>
          </div>
          <div class="action-bar" data-action-bar hidden>
            <button type="button" class="primary" data-bullet>Bullet</button>
            <button type="button" class="primary" data-sub>Sub</button>
            <button type="button" class="primary" data-summary>Summary</button>
            <div class="action-secondary">
              <button type="button" class="secondary" data-clear>Clear</button>
              <button type="button" class="danger" data-delete>Delete</button>
            </div>
          </div>
        </section>
      </main>
      <dialog class="summary-dialog" data-summary-dialog>
        <form method="dialog">
          <h2>Summary</h2>
          <textarea data-summary-field placeholder="Write a summary for this range…"></textarea>
          <div class="dialog-actions">
            <button type="button" class="secondary" data-summary-cancel>Cancel</button>
            <button type="submit" data-summary-save>Save</button>
          </div>
        </form>
      </dialog>
    </div>
  `;
}

function viewModeLabel(mode: ViewMode): string {
  switch (mode) {
    case "text":
      return "Text";
    case "outline":
      return "Outline";
    case "split":
      return "Split";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function appendBreak(target: HTMLElement, kind: BreakKind): void {
  switch (kind) {
    case "none":
      return;
    case "space":
      target.append(" ");
      return;
    case "newline":
      target.append(document.createElement("br"));
      return;
    case "par": {
      target.append(document.createElement("br"));
      target.append(document.createElement("br"));
      return;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function wordIdFromEvent(event: Event): WordId | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const word = target.closest("[data-word-id]");
  if (!(word instanceof HTMLElement) || word.dataset.wordId === undefined) {
    return null;
  }
  return Number(word.dataset.wordId);
}

function requireEl<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  ctor: new () => T,
): T {
  const el = root.querySelector(selector);
  if (!(el instanceof ctor)) {
    throw new Error(`Missing ${selector}`);
  }
  return el;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
