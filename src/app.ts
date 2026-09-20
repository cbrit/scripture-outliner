import { assertNever, type Document, type PinEdge, type WordId } from "./types";
import {
  breaksForPassage,
  passageFromText,
  type BreakKind,
} from "./tokenize";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "./sample";
import {
  MAX_DEPTH,
  canDeepen,
  createDocument,
  createSegment,
  exactSegment,
  headerLabel,
  highlightDepthForWord,
  innermostCoveringSegment,
  insertSegment,
  orderedSelection,
  passageParts,
  removeSegment,
  selectionEquals,
  setSegmentDepth,
  suggestedDepth,
  updateSegment,
} from "./segments";
import { clearDocument, loadDocument, saveDocument } from "./store";
import { exportOutlineMarkdown, outlineFilename } from "./exportMarkdown";

type Refs = {
  titleInput: HTMLInputElement;
  headerActions: HTMLElement;
  importView: HTMLElement;
  importText: HTMLTextAreaElement;
  editor: HTMLElement;
  paneText: HTMLElement;
  passage: HTMLElement;
  pinStart: HTMLButtonElement;
  pinEnd: HTMLButtonElement;
  actionBar: HTMLElement;
  hint: HTMLElement;
  selectionToolbar: HTMLElement;
  summaryDialog: HTMLDialogElement;
  summaryField: HTMLTextAreaElement;
};

const SEG_CLASSES = ["seg-0", "seg-1", "seg-2", "seg-3"] as const;
const HIGHLIGHT_CLASSES = ["selected", ...SEG_CLASSES] as const;

export function mount(root: HTMLElement): void {
  root.innerHTML = shellHtml();
  const refs = bind(root);
  let doc = loadDocument();
  let extendFrom: WordId | null = null;
  let dragging: PinEdge | null = null;
  let builtKey = "";

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
    render({ reveal: true });
  }

  function patchDoc(next: Document): void {
    doc = next;
    persist();
  }

  function render(opts?: { reveal?: boolean }): void {
    if (!doc) {
      refs.importView.hidden = false;
      refs.editor.hidden = true;
      refs.headerActions.hidden = true;
      refs.titleInput.value = "";
      refs.titleInput.disabled = true;
      refs.titleInput.hidden = true;
      refs.actionBar.hidden = true;
      refs.hint.hidden = true;
      refs.selectionToolbar.hidden = true;
      refs.pinStart.hidden = true;
      refs.pinEnd.hidden = true;
      return;
    }
    refs.importView.hidden = true;
    refs.editor.hidden = false;
    refs.headerActions.hidden = false;
    refs.titleInput.disabled = false;
    refs.titleInput.hidden = false;
    refs.titleInput.value = doc.passage.title;
    renderPassage();
    renderActions();
    positionPins();
    positionToolbar();
    if (opts?.reveal) {
      revealSelection();
    }
    requestAnimationFrame(() => {
      positionPins();
      positionToolbar();
      if (opts?.reveal) {
        revealSelection();
      }
    });
  }

  function revealSelection(): void {
    if (!doc?.selection) {
      return;
    }
    wordElement(doc.selection.start)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }

  function structureKey(current: Document): string {
    return `${current.passage.id}:${current.segments
      .map(
        (segment) =>
          `${segment.id}:${segment.start}:${segment.end}:${segment.depth}:${segment.summary}`,
      )
      .join("|")}`;
  }

  function highlightKind(
    current: Document,
    id: WordId,
  ): (typeof HIGHLIGHT_CLASSES)[number] | null {
    const selection = current.selection;
    if (selection !== null && id >= selection.start && id <= selection.end) {
      return "selected";
    }
    const depth = highlightDepthForWord(current.segments, id);
    if (depth === null) {
      return null;
    }
    return SEG_CLASSES[Math.min(depth, SEG_CLASSES.length - 1)] ?? "seg-3";
  }

  function applyHighlightClasses(
    el: HTMLElement,
    kind: (typeof HIGHLIGHT_CLASSES)[number] | null,
  ): void {
    for (const cls of HIGHLIGHT_CLASSES) {
      el.classList.toggle(cls, kind === cls);
    }
  }

  function renderPassage(): void {
    if (!doc) {
      return;
    }
    const key = structureKey(doc);
    if (key !== builtKey) {
      buildPassage();
      builtKey = key;
    }
    const current = doc;
    const words = refs.passage.querySelectorAll<HTMLSpanElement>(".word");
    const breaks = breaksForPassage(current.passage);
    const wordCount = current.passage.words.length;
    for (const el of words) {
      const id = Number(el.dataset.wordId);
      const kind = highlightKind(current, id);
      applyHighlightClasses(el, kind);
      const prevKind = id > 0 ? highlightKind(current, id - 1) : null;
      const nextKind = id + 1 < wordCount ? highlightKind(current, id + 1) : null;
      const breakHere = breaks[id] ?? "space";
      const nextBreak =
        id + 1 < wordCount ? (breaks[id + 1] ?? "space") : "none";
      const runStart =
        kind !== null &&
        (prevKind !== kind ||
          breakHere === "newline" ||
          breakHere === "par" ||
          breakHere === "none");
      const runEnd =
        kind !== null &&
        (nextKind !== kind || nextBreak === "newline" || nextBreak === "par");
      el.classList.toggle("hl-start", runStart);
      el.classList.toggle("hl-end", runEnd);
    }
    for (const gap of refs.passage.querySelectorAll<HTMLSpanElement>(".gap")) {
      const beforeId = Number(gap.dataset.before);
      if (!Number.isInteger(beforeId) || beforeId <= 0) {
        applyHighlightClasses(gap, null);
        continue;
      }
      const left = highlightKind(current, beforeId - 1);
      const right = highlightKind(current, beforeId);
      const fill = left !== null && left === right;
      applyHighlightClasses(gap, fill ? left : null);
    }
    for (const header of refs.passage.querySelectorAll<HTMLElement>(
      "[data-testid='section-header']",
    )) {
      const segmentId = header.dataset.segmentId;
      const segment = current.segments.find((entry) => entry.id === segmentId);
      const currentRange =
        segment !== undefined &&
        selectionEquals(current.selection, segment.start, segment.end);
      header.toggleAttribute("aria-current", currentRange);
    }
  }

  function buildPassage(): void {
    if (!doc) {
      return;
    }
    refs.passage.replaceChildren();
    const current = doc;
    const breaks = breaksForPassage(current.passage);
    const parts = passageParts(current.passage.words.length, current.segments);
    for (const part of parts) {
      switch (part.kind) {
        case "header": {
          refs.passage.append(sectionHeader(current, part.segment));
          break;
        }
        case "words": {
          appendWordRange(
            refs.passage,
            current,
            breaks,
            part.start,
            part.end,
            part.depth,
          );
          break;
        }
        default: {
          const _exhaustive: never = part;
          assertNever(_exhaustive);
        }
      }
    }
  }

  function renderActions(): void {
    if (!doc || !doc.selection) {
      refs.actionBar.hidden = true;
      refs.selectionToolbar.hidden = true;
      refs.hint.hidden = !doc;
      return;
    }
    refs.hint.hidden = true;
    refs.actionBar.hidden = false;
    refs.selectionToolbar.hidden = false;
    const matched = exactSegment(doc.segments, doc.selection);
    const del = refs.actionBar.querySelector("[data-delete]");
    if (del instanceof HTMLButtonElement) {
      del.disabled = !matched;
    }
    const shallower = refs.selectionToolbar.querySelector("[data-shallower]");
    if (shallower instanceof HTMLButtonElement) {
      shallower.disabled = !matched || matched.depth <= 0;
    }
    const deeper = refs.selectionToolbar.querySelector("[data-deeper]");
    if (deeper instanceof HTMLButtonElement) {
      deeper.disabled = matched !== undefined && !canDeepen(doc.segments, matched);
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
    refs.pinStart.style.left = `${(startBox.left + startBox.right) / 2 - origin.left}px`;
    refs.pinStart.style.top = `${startBox.top - origin.top}px`;
    refs.pinEnd.style.left = `${endBox.right - origin.left}px`;
    refs.pinEnd.style.top = `${(endBox.top + endBox.bottom) / 2 - origin.top}px`;
  }

  function positionToolbar(): void {
    if (!doc || !doc.selection) {
      refs.selectionToolbar.hidden = true;
      return;
    }
    const startEl = wordElement(doc.selection.start);
    const endEl = wordElement(doc.selection.end);
    const wrap = refs.passage.parentElement;
    if (!startEl || !endEl || !wrap) {
      refs.selectionToolbar.hidden = true;
      return;
    }
    refs.selectionToolbar.hidden = false;
    const origin = wrap.getBoundingClientRect();
    const startBox = startEl.getBoundingClientRect();
    const endBox = endEl.getBoundingClientRect();
    const rangeTop = Math.min(startBox.top, endBox.top);
    const rangeBottom = Math.max(startBox.bottom, endBox.bottom);
    const rangeLeft = Math.min(startBox.left, endBox.left);
    const toolbar = refs.selectionToolbar;
    const toolbarW = Math.max(toolbar.offsetWidth, 220);
    const toolbarH = Math.max(toolbar.offsetHeight, 44);
    const pad = 6;
    let top = rangeBottom - origin.top + 8;
    let placement = "below";
    if (top + toolbarH > wrap.clientHeight - pad) {
      top = rangeTop - origin.top - toolbarH - 8;
      placement = "above";
    }
    if (top < pad) {
      top = pad;
      placement = "below";
    }
    let left = rangeLeft - origin.left;
    if (left + toolbarW > wrap.clientWidth - pad) {
      left = wrap.clientWidth - toolbarW - pad;
    }
    if (left < pad) {
      left = pad;
    }
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.dataset.placement = placement;
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

  function selectSegmentById(id: string): void {
    if (!doc) {
      return;
    }
    const segment = doc.segments.find((entry) => entry.id === id);
    if (!segment) {
      return;
    }
    extendFrom = null;
    patchDoc({
      ...doc,
      selection: { start: segment.start, end: segment.end },
    });
    render({ reveal: true });
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
      render({ reveal: true });
      return;
    }
    const selection = doc.selection;
    if (
      selection &&
      selection.start !== selection.end &&
      (wordId < selection.start || wordId > selection.end)
    ) {
      const coveringOutside = innermostCoveringSegment(doc.segments, wordId);
      if (coveringOutside) {
        extendFrom = null;
        patchDoc({
          ...doc,
          selection: { start: coveringOutside.start, end: coveringOutside.end },
        });
        render({ reveal: true });
        return;
      }
      extendFrom = wordId;
      patchDoc({ ...doc, selection: { start: wordId, end: wordId } });
      render({ reveal: true });
      return;
    }
    const covering = innermostCoveringSegment(doc.segments, wordId);
    if (
      covering &&
      !selectionEquals(doc.selection, covering.start, covering.end)
    ) {
      extendFrom = null;
      patchDoc({
        ...doc,
        selection: { start: covering.start, end: covering.end },
      });
      render({ reveal: true });
      return;
    }
    if (
      covering &&
      selectionEquals(doc.selection, covering.start, covering.end)
    ) {
      extendFrom = wordId;
      patchDoc({ ...doc, selection: { start: wordId, end: wordId } });
      render({ reveal: true });
      return;
    }
    extendFrom = wordId;
    patchDoc({ ...doc, selection: { start: wordId, end: wordId } });
    render({ reveal: true });
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
    positionToolbar();
  }

  function importTextAs(title: string, raw: string): void {
    const passage = passageFromText(title, raw);
    if (passage.words.length === 0) {
      refs.importText.focus();
      return;
    }
    extendFrom = null;
    builtKey = "";
    setDoc(createDocument(passage));
  }

  function applySegmentDepth(depth: number): void {
    if (!doc || !doc.selection) {
      return;
    }
    const clamped = Math.max(0, Math.min(MAX_DEPTH, depth));
    extendFrom = null;
    const existing = exactSegment(doc.segments, doc.selection);
    if (existing) {
      patchDoc({
        ...doc,
        segments: setSegmentDepth(doc.segments, existing.id, clamped),
      });
      render({ reveal: true });
      return;
    }
    patchDoc({
      ...doc,
      segments: insertSegment(
        doc.segments,
        createSegment(doc.selection, clamped),
      ),
    });
    render();
  }

  function markSection(): void {
    applySegmentDepth(0);
  }

  function markDeeper(): void {
    if (!doc || !doc.selection) {
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    if (existing) {
      if (!canDeepen(doc.segments, existing)) {
        return;
      }
      applySegmentDepth(existing.depth + 1);
      return;
    }
    applySegmentDepth(suggestedDepth(doc.segments, doc.selection));
  }

  function markShallower(): void {
    if (!doc || !doc.selection) {
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    if (!existing || existing.depth <= 0) {
      return;
    }
    applySegmentDepth(existing.depth - 1);
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
      const depth = suggestedDepth(doc.segments, doc.selection);
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
    builtKey = "";
    refs.importText.value = "";
    setDoc(null);
  }

  refs.importView.querySelector("[data-import-submit]")?.addEventListener(
    "click",
    () => importTextAs("Untitled", refs.importText.value),
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
  root.querySelector("[data-export]")?.addEventListener("click", exportOutline);
  root.querySelector("[data-new]")?.addEventListener("click", newDocument);

  refs.passage.addEventListener("pointerdown", (event) => {
    if (dragging) {
      return;
    }
    const header = headerFromEvent(event);
    if (header) {
      refs.passage.dataset.tapHeader = header;
      refs.passage.dataset.tapX = String(event.clientX);
      refs.passage.dataset.tapY = String(event.clientY);
      delete refs.passage.dataset.tapId;
      return;
    }
    const word = wordIdFromEvent(event);
    if (word === null) {
      return;
    }
    refs.passage.dataset.tapX = String(event.clientX);
    refs.passage.dataset.tapY = String(event.clientY);
    refs.passage.dataset.tapId = String(word);
    delete refs.passage.dataset.tapHeader;
  });
  refs.passage.addEventListener("pointerup", (event) => {
    const tapX = Number(refs.passage.dataset.tapX);
    const tapY = Number(refs.passage.dataset.tapY);
    const headerId = refs.passage.dataset.tapHeader;
    const rawId = refs.passage.dataset.tapId;
    delete refs.passage.dataset.tapId;
    delete refs.passage.dataset.tapX;
    delete refs.passage.dataset.tapY;
    delete refs.passage.dataset.tapHeader;
    if (Number.isNaN(tapX) || Number.isNaN(tapY)) {
      return;
    }
    if (Math.hypot(event.clientX - tapX, event.clientY - tapY) > 14) {
      return;
    }
    if (headerId) {
      selectSegmentById(headerId);
      return;
    }
    if (rawId === undefined) {
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

  refs.selectionToolbar.querySelector("[data-section]")?.addEventListener(
    "click",
    markSection,
  );
  refs.selectionToolbar.querySelector("[data-deeper]")?.addEventListener(
    "click",
    markDeeper,
  );
  refs.selectionToolbar.querySelector("[data-shallower]")?.addEventListener(
    "click",
    markShallower,
  );
  refs.selectionToolbar.querySelector("[data-summary]")?.addEventListener(
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

  refs.paneText.addEventListener("scroll", () => {
    positionPins();
    positionToolbar();
  }, {
    passive: true,
  });
  window.addEventListener("resize", () => {
    positionPins();
    positionToolbar();
  });

  document.addEventListener(
    "touchmove",
    (event) => {
      if (dragging) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  render({ reveal: true });
}

function bind(root: HTMLElement): Refs {
  return {
    titleInput: requireEl(root, ".title-input", HTMLInputElement),
    headerActions: requireEl(root, ".header-actions", HTMLElement),
    importView: requireEl(root, "[data-import]", HTMLElement),
    importText: requireEl(root, "[data-import-text]", HTMLTextAreaElement),
    editor: requireEl(root, "[data-editor]", HTMLElement),
    paneText: requireEl(root, "[data-pane-text]", HTMLElement),
    passage: requireEl(root, "[data-passage]", HTMLElement),
    pinStart: requireEl(root, "[data-pin-start]", HTMLButtonElement),
    pinEnd: requireEl(root, "[data-pin-end]", HTMLButtonElement),
    actionBar: requireEl(root, "[data-action-bar]", HTMLElement),
    hint: requireEl(root, "[data-hint]", HTMLElement),
    selectionToolbar: requireEl(root, "[data-selection-toolbar]", HTMLElement),
    summaryDialog: requireEl(root, "[data-summary-dialog]", HTMLDialogElement),
    summaryField: requireEl(root, "[data-summary-field]", HTMLTextAreaElement),
  };
}

function shellHtml(): string {
  return `
    <div class="shell">
      <header class="header">
        <div class="brand">
          <h1 data-testid="app-title">Scripture Outliner</h1>
          <input class="title-input" type="text" placeholder="Untitled" hidden data-testid="title-input" />
        </div>
        <div class="header-actions" hidden>
          <button type="button" class="secondary" data-export data-testid="export">Export</button>
          <button type="button" class="ghost" data-new data-testid="new-document">New</button>
        </div>
      </header>
      <main class="main">
        <section class="empty" data-import data-testid="import-view">
          <h2>Import text</h2>
          <p>Paste any text. Select by tapping words — nothing is auto-outlined.</p>
          <textarea data-import-text data-testid="import-text" placeholder="Paste text…"></textarea>
          <div class="empty-actions">
            <button type="button" data-import-submit data-testid="import-submit">Import</button>
            <button type="button" class="secondary" data-load-sample data-testid="load-sample">Load sample</button>
          </div>
        </section>
        <section class="editor" hidden data-editor data-testid="editor">
          <div class="pane pane-text" data-pane-text data-testid="pane-text">
            <div class="passage-wrap">
              <div class="passage" data-passage data-testid="passage"></div>
              <button type="button" class="pin pin-start" data-pin-start data-testid="pin-start" hidden aria-label="Selection start"></button>
              <button type="button" class="pin pin-end" data-pin-end data-testid="pin-end" hidden aria-label="Selection end"></button>
              <div
                class="selection-toolbar"
                data-selection-toolbar
                data-testid="selection-toolbar"
                hidden
              >
                <button type="button" data-section data-testid="action-section" aria-label="Section" title="Section">Section</button>
                <button type="button" data-deeper data-testid="action-deeper" aria-label="Deeper" title="Deeper">Deeper</button>
                <button type="button" data-shallower data-testid="action-shallower" aria-label="Shallower" title="Shallower">Shallower</button>
                <button type="button" data-summary data-testid="action-summary" aria-label="Summary" title="Summary">Summary</button>
              </div>
            </div>
            <p class="hint" data-hint data-testid="selection-hint">Tap a word to select. Tap a second word to extend. Drag the pins to snap.</p>
          </div>
          <div class="action-bar" data-action-bar data-testid="action-bar" hidden>
            <div class="action-secondary">
              <button type="button" class="secondary" data-clear data-testid="action-clear">Clear</button>
              <button type="button" class="danger" data-delete data-testid="action-delete">Delete</button>
            </div>
          </div>
        </section>
      </main>
      <dialog class="summary-dialog" data-summary-dialog data-testid="summary-dialog">
        <form method="dialog">
          <h2>Summary</h2>
          <textarea data-summary-field data-testid="summary-field" placeholder="Write a heading for this range…"></textarea>
          <div class="dialog-actions">
            <button type="button" class="secondary" data-summary-cancel data-testid="summary-cancel">Cancel</button>
            <button type="submit" data-summary-save data-testid="summary-save">Save</button>
          </div>
        </form>
      </dialog>
    </div>
  `;
}

function sectionHeader(
  doc: Document,
  segment: Document["segments"][number],
): HTMLElement {
  const level = Math.min(6, Math.max(2, segment.depth + 2));
  const el = document.createElement(`h${level}`);
  el.className = "section-header";
  el.dataset.depth = String(segment.depth);
  el.dataset.segmentId = segment.id;
  el.setAttribute("data-testid", "section-header");
  const label = headerLabel(doc.passage.words, segment);
  el.textContent = label.text;
  if (label.placeholder) {
    el.dataset.placeholder = "true";
  }
  return el;
}

function appendWordRange(
  target: HTMLElement,
  doc: Document,
  breaks: BreakKind[],
  start: WordId,
  end: WordId,
  depth: number,
): void {
  if (end < start) {
    return;
  }
  const run = document.createElement("span");
  run.className = "word-run";
  run.dataset.depth = String(depth);
  let first = true;
  for (let id = start; id <= end; id += 1) {
    const word = doc.passage.words[id];
    if (!word) {
      continue;
    }
    const kind = breaks[id] ?? "space";
    if (first) {
      first = false;
      if (kind !== "none" && kind !== "space") {
        appendBreak(run, kind, id);
      }
    } else {
      appendBreak(run, kind, id);
    }
    const span = document.createElement("span");
    span.className = "word";
    span.dataset.wordId = String(word.id);
    span.setAttribute("data-testid", "word");
    span.textContent = word.text;
    run.append(span);
  }
  if (run.childElementCount === 0) {
    return;
  }
  target.append(run);
}

function appendBreak(
  target: HTMLElement,
  kind: BreakKind,
  beforeWordId: WordId,
): void {
  switch (kind) {
    case "none":
      return;
    case "space": {
      const gap = document.createElement("span");
      gap.className = "gap";
      gap.dataset.before = String(beforeWordId);
      gap.textContent = " ";
      target.append(gap);
      return;
    }
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

function headerFromEvent(event: Event): string | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const header = target.closest("[data-testid='section-header']");
  if (!(header instanceof HTMLElement) || header.dataset.segmentId === undefined) {
    return null;
  }
  return header.dataset.segmentId;
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
