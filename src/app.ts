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
  type PassagePart,
  removeSegment,
  selectionEquals,
  setSegmentDepth,
  suggestedDepth,
} from "./segments";
import {
  abortSummaryEdit,
  applySummaryDraft,
  beginSummaryEdit,
  overlaySummaryEdit,
  snapshotSummaryDraft,
  summaryEditChromeKey,
  type PassageViewPart,
  type SummaryEdit,
} from "./summaryEdit";
import { clearDocument, loadDocument, loadPrefs, saveDocument, savePrefs } from "./store";
import {
  DOCX_MIME,
  exportBlocks,
  outlineFilename,
  renderDocx,
  renderMarkdown,
  type ExportFormat,
} from "./exportDocument";

type Refs = {
  titleInput: HTMLInputElement;
  headerActions: HTMLElement;
  showTextInput: HTMLInputElement;
  exportButton: HTMLButtonElement;
  exportMenu: HTMLElement;
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
  let prefs = loadPrefs();
  let extendFrom: WordId | null = null;
  let dragging: PinEdge | null = null;
  let pendingTap: PendingTap | null = null;
  let builtKey = "";
  let summaryEdit: SummaryEdit = abortSummaryEdit();
  let suppressSummaryCommit = false;

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
    refs.showTextInput.checked = prefs.showText;
    if (!doc) {
      summaryEdit = abortSummaryEdit();
      refs.importView.hidden = false;
      refs.editor.hidden = true;
      refs.headerActions.hidden = true;
      setExportMenuOpen(false);
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
    return `${current.passage.id}:${prefs.showText}:${current.segments
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
    // Chrome key omits draft so typing does not remount the field.
    const key = `${structureKey(doc)}|${summaryEditChromeKey(summaryEdit)}`;
    if (key !== builtKey) {
      const field = refs.passage.querySelector(
        "[data-testid='summary-field']",
      );
      if (field instanceof HTMLTextAreaElement) {
        summaryEdit = snapshotSummaryDraft(summaryEdit, field.value);
      }
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
    const current = doc;
    const breaks = breaksForPassage(current.passage);
    const parts = mergeLooseWordParts(
      passageParts(current.passage.words.length, current.segments),
      breaks,
    );
    const view = overlaySummaryEdit(parts, current.segments, summaryEdit);
    suppressSummaryCommit = true;
    refs.passage.replaceChildren();
    for (const part of view) {
      switch (part.kind) {
        case "header": {
          refs.passage.append(sectionHeader(part.segment));
          break;
        }
        case "summary-editor": {
          if (summaryEdit.kind === "editing") {
            refs.passage.append(sectionHeaderEditor(part, summaryEdit));
          }
          break;
        }
        case "words": {
          if (prefs.showText) {
            appendWordRange(
              refs.passage,
              current,
              breaks,
              part.start,
              part.end,
              part.depth,
            );
          }
          break;
        }
        default: {
          const _exhaustive: never = part;
          assertNever(_exhaustive);
        }
      }
    }
    const mounted = summaryField();
    if (mounted) {
      sizeSummaryField(mounted);
    }
    suppressSummaryCommit = false;
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
    const wrap = refs.passage.parentElement;
    if (!wrap) {
      refs.selectionToolbar.hidden = true;
      return;
    }
    const field = summaryField();
    const startEl = wordElement(doc.selection.start);
    const endEl = wordElement(doc.selection.end);
    if (field) {
      const box = field.getBoundingClientRect();
      placeToolbar(wrap, box, box, true);
      return;
    }
    if (startEl && endEl) {
      placeToolbar(wrap, startEl.getBoundingClientRect(), endEl.getBoundingClientRect());
      return;
    }
    if (!prefs.showText) {
      const header = headerForSelection(doc);
      if (header) {
        const box = header.getBoundingClientRect();
        placeToolbar(wrap, box, box);
        return;
      }
    }
    refs.selectionToolbar.hidden = true;
  }

  function placeToolbar(
    wrap: HTMLElement,
    startBox: DOMRect,
    endBox: DOMRect,
    preferBelow = false,
  ): void {
    refs.selectionToolbar.hidden = false;
    const origin = wrap.getBoundingClientRect();
    const rangeTop = Math.min(startBox.top, endBox.top);
    const rangeBottom = Math.max(startBox.bottom, endBox.bottom);
    const toolbar = refs.selectionToolbar;
    const toolbarW = Math.max(toolbar.offsetWidth, 248);
    const toolbarH = Math.max(toolbar.offsetHeight, 44);
    const pad = 6;
    let top = rangeTop - origin.top - toolbarH - 8;
    let placement = "above";
    if (preferBelow || top < pad) {
      top = rangeBottom - origin.top + 8;
      placement = "below";
    }
    if (top < pad) {
      top = pad;
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

  function headerForSelection(current: Document): HTMLElement | null {
    if (!current.selection) {
      return null;
    }
    const matched = exactSegment(current.segments, current.selection);
    if (!matched) {
      return null;
    }
    const header = refs.passage.querySelector(
      `[data-testid='section-header'][data-segment-id="${matched.id}"]`,
    );
    return header instanceof HTMLElement ? header : null;
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
    summaryEdit = abortSummaryEdit();
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

  function summaryField(): HTMLTextAreaElement | null {
    const field = refs.passage.querySelector("[data-testid='summary-field']");
    return field instanceof HTMLTextAreaElement ? field : null;
  }

  function queueSummaryFieldFocus(): void {
    requestAnimationFrame(() => {
      const field = summaryField();
      if (!field) {
        return;
      }
      field.focus();
      const end = field.value.length;
      field.setSelectionRange(end, end);
      sizeSummaryField(field);
      positionPins();
      positionToolbar();
    });
  }

  function sectionHeaderEditor(
    part: Extract<PassageViewPart, { kind: "summary-editor" }>,
    edit: Extract<SummaryEdit, { kind: "editing" }>,
  ): HTMLTextAreaElement {
    const field = document.createElement("textarea");
    field.className = "section-header section-header-edit";
    field.dataset.depth = String(part.depth);
    field.setAttribute("data-testid", "summary-field");
    field.rows = 1;
    field.placeholder = "Write a heading for this range…";
    field.setAttribute("aria-label", "Summary");
    field.value = edit.draft;
    field.addEventListener("input", () => {
      summaryEdit = snapshotSummaryDraft(summaryEdit, field.value);
      sizeSummaryField(field);
      positionToolbar();
    });
    field.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "Enter":
          event.preventDefault();
          commitSummaryEdit();
          break;
        case "Escape":
          event.preventDefault();
          cancelSummaryEdit();
          break;
        default:
          break;
      }
    });
    field.addEventListener("blur", () => {
      if (suppressSummaryCommit) {
        return;
      }
      commitSummaryEdit();
    });
    return field;
  }

  function openSummary(): void {
    if (!doc || !doc.selection) {
      return;
    }
    if (summaryEdit.kind === "editing") {
      summaryField()?.focus();
      return;
    }
    const existing = exactSegment(doc.segments, doc.selection);
    summaryEdit = beginSummaryEdit(doc.selection, existing);
    render({ reveal: true });
    queueSummaryFieldFocus();
  }

  function commitSummaryEdit(): void {
    if (!doc || summaryEdit.kind === "idle") {
      return;
    }
    const raw = summaryField()?.value ?? summaryEdit.draft;
    const next = applySummaryDraft(doc, summaryEdit, raw);
    suppressSummaryCommit = true;
    summaryEdit = abortSummaryEdit();
    if (next !== doc) {
      patchDoc(next);
    }
    render();
    suppressSummaryCommit = false;
  }

  function cancelSummaryEdit(): void {
    if (summaryEdit.kind === "idle") {
      return;
    }
    suppressSummaryCommit = true;
    summaryEdit = abortSummaryEdit();
    render();
    suppressSummaryCommit = false;
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
    summaryEdit = abortSummaryEdit();
    patchDoc({
      ...doc,
      segments: removeSegment(doc.segments, existing.id),
    });
    render();
  }

  function exportMenuOpen(): boolean {
    return !refs.exportMenu.hidden;
  }

  function setExportMenuOpen(open: boolean): void {
    refs.exportMenu.hidden = !open;
    refs.exportButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) {
      refs.exportMenu.style.left = "";
      return;
    }
    refs.exportMenu.style.left = "0px";
    const pad = 8;
    const box = refs.exportMenu.getBoundingClientRect();
    let left = 0;
    if (box.right > window.innerWidth - pad) {
      left -= box.right - (window.innerWidth - pad);
    }
    if (box.left + left < pad) {
      left += pad - (box.left + left);
    }
    refs.exportMenu.style.left = `${left}px`;
  }

  function toggleExportMenu(): void {
    if (!doc) {
      return;
    }
    setExportMenuOpen(!exportMenuOpen());
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  }

  function exportAs(format: ExportFormat): void {
    if (!doc) {
      return;
    }
    const includeBody = prefs.showText;
    const blocks = exportBlocks(doc, includeBody);
    const filename = outlineFilename(doc.passage.title, format);
    switch (format) {
      case "md": {
        const markdown = renderMarkdown(blocks);
        downloadBlob(new Blob([markdown], { type: "text/markdown" }), filename);
        void navigator.clipboard?.writeText(markdown).catch(() => undefined);
        break;
      }
      case "docx": {
        const bytes = renderDocx(blocks);
        downloadBlob(new Blob([bytesToArrayBuffer(bytes)], { type: DOCX_MIME }), filename);
        break;
      }
      default: {
        const _exhaustive: never = format;
        assertNever(_exhaustive);
      }
    }
    setExportMenuOpen(false);
  }

  function newDocument(): void {
    if (doc?.segments.length && !window.confirm("Replace the current document?")) {
      return;
    }
    summaryEdit = abortSummaryEdit();
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
  refs.exportButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExportMenu();
  });
  refs.exportMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const item = target.closest("[data-export-format]");
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const format = parseExportFormat(item.dataset.exportFormat);
    if (format) {
      exportAs(format);
    }
  });
  document.addEventListener("click", () => {
    if (exportMenuOpen()) {
      setExportMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (summaryEdit.kind === "editing") {
      event.preventDefault();
      cancelSummaryEdit();
      return;
    }
    if (exportMenuOpen()) {
      setExportMenuOpen(false);
    }
  });
  root.querySelector("[data-new]")?.addEventListener("click", newDocument);
  refs.showTextInput.addEventListener("change", () => {
    prefs = { showText: refs.showTextInput.checked };
    savePrefs(prefs);
    render();
  });

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

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (summaryEdit.kind !== "editing") {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        commitSummaryEdit();
        return;
      }
      if (target.closest("[data-testid='summary-field'], .section-header-edit")) {
        return;
      }
      commitSummaryEdit();
    },
    true,
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
    showTextInput: requireEl(root, "[data-testid='show-text-input']", HTMLInputElement),
    exportButton: requireEl(root, "[data-export]", HTMLButtonElement),
    exportMenu: requireEl(root, "[data-export-menu]", HTMLElement),
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
          <label class="show-text" data-testid="show-text">
            <input type="checkbox" checked data-testid="show-text-input" />
            Show text
          </label>
          <div class="export-control" data-export-control>
            <button type="button" class="secondary" data-export data-testid="export" aria-haspopup="menu" aria-expanded="false" aria-controls="export-menu">Export</button>
            <div id="export-menu" class="export-menu" role="menu" hidden data-export-menu data-testid="export-menu">
              <button type="button" role="menuitem" data-export-format="md" data-testid="export-markdown">Markdown (.md)</button>
              <button type="button" role="menuitem" data-export-format="docx" data-testid="export-docx">Word (.docx)</button>
            </div>
          </div>
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

function sizeSummaryField(field: HTMLTextAreaElement): void {
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

/**
 * Keep trailing loose words in the previous unindented run when the original
 * break was a space. A leftover headerless section must not force a newline.
 */
function mergeLooseWordParts(
  parts: readonly PassagePart[],
  breaks: BreakKind[],
): PassagePart[] {
  const merged: PassagePart[] = [];
  for (const part of parts) {
    switch (part.kind) {
      case "header":
        merged.push(part);
        break;
      case "words": {
        const prev = merged[merged.length - 1];
        if (
          prev?.kind === "words" &&
          part.depth === -1 &&
          prev.depth < 1 &&
          (breaks[part.start] ?? "space") === "space"
        ) {
          merged[merged.length - 1] = {
            kind: "words",
            start: prev.start,
            end: part.end,
            depth: prev.depth,
          };
          break;
        }
        merged.push(part);
        break;
      }
      default: {
        const _exhaustive: never = part;
        assertNever(_exhaustive);
      }
    }
  }
  return merged;
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

function parseExportFormat(value: string | undefined): ExportFormat | null {
  switch (value) {
    case "md":
      return "md";
    case "docx":
      return "docx";
    default:
      return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
