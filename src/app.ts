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
  passageWrap: HTMLElement;
  passage: HTMLElement;
  pinStart: HTMLButtonElement;
  pinEnd: HTMLButtonElement;
  hint: HTMLElement;
  selectionToolbar: HTMLElement;
  summaryDialog: HTMLDialogElement;
  summaryField: HTMLTextAreaElement;
};

type PendingTap =
  | { kind: "word"; id: WordId; x: number; y: number }
  | { kind: "header"; id: string; x: number; y: number }
  | { kind: "empty"; x: number; y: number };

const ICON_DEEPER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M6 5h12M10 10h8M10 10v8M7 15l3 3 3-3"/></svg>`;
const ICON_SHALLOWER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M6 19h12M10 14h8M10 14V6M7 9l3-3 3 3"/></svg>`;
const ICON_SUMMARY = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 9h8M8 13h6"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M7 7l10 10M17 7 7 17"/></svg>`;

export function mount(root: HTMLElement): void {
  root.innerHTML = shellHtml();
  const refs = bind(root);
  let doc = loadDocument();
  let extendFrom: WordId | null = null;
  let dragging: PinEdge | null = null;
  let pendingTap: PendingTap | null = null;
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

  function wordSelected(current: Document, id: WordId): boolean {
    const selection = current.selection;
    return selection !== null && id >= selection.start && id <= selection.end;
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
      const selected = wordSelected(current, id);
      el.classList.toggle("selected", selected);
      const prevSelected = id > 0 && wordSelected(current, id - 1);
      const nextSelected =
        id + 1 < wordCount && wordSelected(current, id + 1);
      const breakHere = breaks[id] ?? "space";
      const nextBreak =
        id + 1 < wordCount ? (breaks[id + 1] ?? "space") : "none";
      const runStart =
        selected &&
        (!prevSelected ||
          breakHere === "newline" ||
          breakHere === "par" ||
          breakHere === "none");
      const runEnd =
        selected &&
        (!nextSelected || nextBreak === "newline" || nextBreak === "par");
      el.classList.toggle("hl-start", runStart);
      el.classList.toggle("hl-end", runEnd);
    }
    for (const gap of refs.passage.querySelectorAll<HTMLSpanElement>(".gap")) {
      const beforeId = Number(gap.dataset.before);
      if (!Number.isInteger(beforeId) || beforeId <= 0) {
        gap.classList.toggle("selected", false);
        continue;
      }
      const fill =
        wordSelected(current, beforeId - 1) && wordSelected(current, beforeId);
      gap.classList.toggle("selected", fill);
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
          refs.passage.append(sectionHeader(part.segment));
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
      refs.selectionToolbar.hidden = true;
      refs.hint.hidden = !doc;
      return;
    }
    refs.hint.hidden = true;
    refs.selectionToolbar.hidden = false;
    const matched = exactSegment(doc.segments, doc.selection);
    const del = refs.selectionToolbar.querySelector("[data-delete]");
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
    const toolbar = refs.selectionToolbar;
    const toolbarW = Math.max(toolbar.offsetWidth, 248);
    const toolbarH = Math.max(toolbar.offsetHeight, 44);
    const pad = 6;
    let top = rangeTop - origin.top - toolbarH - 8;
    let placement = "above";
    if (top < pad) {
      top = rangeBottom - origin.top + 8;
      placement = "below";
    }
    const pinCenterX = (startBox.left + startBox.right) / 2 - origin.left;
    // Keep the hint off the start pin and off the following line of words.
    const pinClear = 26;
    let left = pinCenterX + pinClear;
    if (left + toolbarW > wrap.clientWidth - pad) {
      left = pinCenterX - pinClear - toolbarW;
    }
    if (left < pad) {
      left = pad;
    }
    if (left + toolbarW > wrap.clientWidth - pad) {
      left = wrap.clientWidth - toolbarW - pad;
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

  function beginTap(event: PointerEvent): void {
    if (dragging || isSelectionChrome(event)) {
      return;
    }
    const x = event.clientX;
    const y = event.clientY;
    const header = headerFromEvent(event);
    if (header) {
      pendingTap = { kind: "header", id: header, x, y };
      return;
    }
    const word = wordIdFromEvent(event);
    if (word !== null) {
      pendingTap = { kind: "word", id: word, x, y };
      return;
    }
    if (isInlineText(event)) {
      pendingTap = null;
      return;
    }
    pendingTap = { kind: "empty", x, y };
  }

  function endTap(event: PointerEvent): void {
    const tap = pendingTap;
    pendingTap = null;
    if (!tap) {
      return;
    }
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 14) {
      return;
    }
    switch (tap.kind) {
      case "word":
        onWordTap(tap.id);
        return;
      case "header":
        selectSegmentById(tap.id);
        return;
      case "empty":
        clearSelection();
        return;
      default: {
        const _exhaustive: never = tap;
        assertNever(_exhaustive);
      }
    }
  }

  function onPaneOrWrapPointerDown(event: PointerEvent): void {
    // Pane padding is the only hit that does not bubble through the wrap.
    if (event.currentTarget === refs.paneText && event.target !== refs.paneText) {
      return;
    }
    beginTap(event);
  }

  refs.passageWrap.addEventListener("pointerdown", onPaneOrWrapPointerDown);
  refs.passageWrap.addEventListener("pointerup", endTap);
  refs.passageWrap.addEventListener("pointercancel", () => {
    pendingTap = null;
  });
  refs.paneText.addEventListener("pointerdown", onPaneOrWrapPointerDown);
  refs.paneText.addEventListener("pointerup", endTap);
  refs.paneText.addEventListener("pointercancel", () => {
    pendingTap = null;
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
  refs.selectionToolbar.querySelector("[data-delete]")?.addEventListener(
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
    passageWrap: requireEl(root, "[data-passage-wrap]", HTMLElement),
    passage: requireEl(root, "[data-passage]", HTMLElement),
    pinStart: requireEl(root, "[data-pin-start]", HTMLButtonElement),
    pinEnd: requireEl(root, "[data-pin-end]", HTMLButtonElement),
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
            <div class="passage-wrap" data-passage-wrap data-testid="passage-wrap">
              <div class="passage" data-passage data-testid="passage"></div>
              <button type="button" class="pin pin-start" data-pin-start data-testid="pin-start" hidden aria-label="Selection start"></button>
              <button type="button" class="pin pin-end" data-pin-end data-testid="pin-end" hidden aria-label="Selection end"></button>
              <div
                class="selection-toolbar"
                data-selection-toolbar
                data-testid="selection-toolbar"
                hidden
              >
                <button type="button" data-deeper data-testid="action-deeper" aria-label="Deeper" title="Deeper">${ICON_DEEPER}</button>
                <button type="button" data-shallower data-testid="action-shallower" aria-label="Shallower" title="Shallower">${ICON_SHALLOWER}</button>
                <button type="button" data-summary data-testid="action-summary" aria-label="Summary" title="Summary">${ICON_SUMMARY}</button>
                <span class="toolbar-sep" aria-hidden="true"></span>
                <button type="button" data-delete data-testid="action-delete" aria-label="Delete" title="Delete">${ICON_DELETE}</button>
              </div>
            </div>
            <p class="hint" data-hint data-testid="selection-hint">Tap a word to select. Tap a second word to extend. Drag the pins. Tap the margin to deselect.</p>
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

function sectionHeader(segment: Document["segments"][number]): HTMLElement {
  const level = Math.min(6, Math.max(2, segment.depth + 2));
  const el = document.createElement(`h${level}`);
  el.className = "section-header";
  el.dataset.depth = String(segment.depth);
  el.dataset.segmentId = segment.id;
  el.setAttribute("data-testid", "section-header");
  el.textContent = segment.summary.trim();
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

function isSelectionChrome(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.closest(
      "[data-pin-start], [data-pin-end], [data-selection-toolbar], button, a, input, textarea",
    ) !== null
  );
}

function isInlineText(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(".gap") !== null;
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
