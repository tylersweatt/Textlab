import {
  deleteBracket as removeBracket,
  drawBracket,
  flipBracket,
  rejoinProposition,
  setBracketNote,
  setBracketRelation,
  splitProposition,
  toggleMainSide,
} from "./brackets.js";
import { renderPhrasingSvg, renderSvg, toOutline } from "./diagram.js";
import { fetchEsvPassage } from "./esv.js";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history.js";
import {
  ESV_VERSE_LIMIT,
  clearBrackets,
  createStudy,
  esvVerseCount,
  getNode,
  libraryVerseCount,
  selectionStillValid,
  setNodeNote,
  setTitle,
  uid,
} from "./model.js";
import { MAX_PROPOSITIONS, nodesFromVerses, versesFromPlainText } from "./passage.js";
import {
  deleteLine,
  linesFromNodes,
  mergeLineWithNext,
  rebuildPhrasing,
  setIndent,
  splitLine,
} from "./phrasing.js";
import { sampleStudy } from "./sample.js";
import { loadSettings, loadStudies, memoryStorage, saveSettings, saveStudies } from "./storage.js";
import { exportLibraryFile, exportStudyFile, planImport, readTransfer, validateStudy } from "./transfer.js";
import { charIndexOfWord } from "./words.js";
import { paintGutter, renderApp } from "./view.js";

const storage = browserStorage();
const memoryOnly = storage.isMemory === true;
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "application/json,.json";
fileInput.hidden = true;
document.body.append(fileInput);

const state = {
  settings: loadSettings(storage),
  studies: [],
  history: null,
  selection: null,
  view: "brackets",
  dialog: null,
  draft: null,
  noteEditor: null,
  noteSession: false,
  textSession: false,
  sheet: false,
  banner: null,
  busy: false,
  offline: typeof navigator !== "undefined" && navigator.onLine === false,
  storageWarning: memoryOnly ? "This browser is not keeping studies on the device. Export a copy before you leave." : null,
  studyQuery: "",
  renaming: false,
  focusNote: false,
  resolved: "light",
  canUndo: false,
  canRedo: false,
  editing: true,
  conj: true,
  pending: null,
  pop: null,
  relQuery: "",
  notice: "",
  loadRef: "",
  titleDraft: null,
  focusPop: false,
};

let focusDialog = false;

function browserStorage() {
  try {
    const probe = "__textlab_probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const memory = memoryStorage();
    memory.isMemory = true;
    return memory;
  }
}

function current() {
  return state.history.present;
}

function resolveTheme(setting) {
  if (setting === "light" || setting === "dark") return setting;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  state.resolved = resolveTheme(state.settings.theme);
  document.documentElement.dataset.theme = state.resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.resolved === "dark" ? "#13161b" : "#f5f5f2");
}

function banner(text) {
  state.banner = { text };
  render();
}

function persist() {
  try {
    const study = structuredClone(current());
    const index = state.studies.findIndex((item) => item.id === study.id);
    if (index >= 0) state.studies[index] = study;
    else state.studies.push(study);
    saveStudies(state.studies, storage);
    state.settings.activeStudyId = study.id;
    saveSettings(state.settings, storage);
  } catch {
    state.storageWarning = "The study could not be saved on this device. Export a copy.";
  }
}

function syncHistoryFlags() {
  state.canUndo = canUndo(state.history);
  state.canRedo = canRedo(state.history);
}

function render() {
  const scroller = document.querySelector(".canvas-wrap");
  const top = scroller?.scrollTop || 0;
  const left = scroller?.scrollLeft || 0;
  const activeId = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  applyTheme();
  syncHistoryFlags();
  document.title = `TextLab — ${current().title}`;
  document.getElementById("app").replaceChildren(renderApp(state, handlers));
  const next = document.querySelector(".canvas-wrap");
  if (next) {
    next.scrollTop = top;
    next.scrollLeft = left;
  }
  if (state.focusNote) {
    const note = document.querySelector(".note-input");
    note?.focus();
    if (note?.setSelectionRange) note.setSelectionRange(note.value.length, note.value.length);
    state.focusNote = false;
  } else if (activeId) {
    const field = document.getElementById(activeId);
    if (field) {
      field.focus();
      if (typeof caret === "number" && field.setSelectionRange) field.setSelectionRange(caret, caret);
    }
  } else if (focusDialog) {
    document.querySelector("[data-autofocus]")?.focus();
    focusDialog = false;
  }
  const form = document.getElementById("new-study-form") || document.getElementById("settings-form");
  if (focusDialog === false && state.dialog && form && !activeId) {
    form.querySelector("input, textarea")?.focus();
  }
  if (state.pop?.kind === "rel" && (state.focusPop || activeId === "rel-search")) {
    const search = document.getElementById("rel-search");
    if (search) {
      search.focus();
      const end = search.value.length;
      search.setSelectionRange(end, end);
    }
  } else if (state.pop?.kind === "note" && state.focusPop) {
    document.getElementById("pop-note")?.focus();
  }
  state.focusPop = false;
  paintGutter(state, handlers);
}

function dispatch(mutator, after) {
  try {
    const next = mutator(current());
    state.history = commit(state.history, next);
    state.banner = null;
    if (after) after();
    else if (!selectionStillValid(current(), state.selection)) state.selection = null;
    persist();
    render();
  } catch (error) {
    banner(error.message || "That could not be done.");
  }
}

function openDialog(dialog) {
  state.dialog = dialog;
  state.sheet = false;
  if (dialog?.type === "new") state.draft = { mode: state.settings.esvApiKey ? "esv" : "paste", clauses: "yes" };
  if (dialog?.type === "replace") {
    state.draft = {
      mode: current().translation === "ESV" ? "esv" : "paste",
      reference: current().reference,
      title: current().title,
      translationName: current().translationName,
      clauses: "yes",
    };
  }
  focusDialog = true;
  render();
}

function closeDialog() {
  state.dialog = null;
  state.busy = false;
  render();
}

function confirmDialog(options) {
  state.dialog = { type: "confirm", ...options };
  focusDialog = true;
  render();
}

function draftObject(form) {
  const draft = Object.fromEntries(form.entries());
  if (!form.get("clauses")) draft.clauses = "no";
  return draft;
}

function assertRoom(adding, replacing) {
  const others = state.studies.filter((study) => !replacing || study.id !== current().id);
  const used = libraryVerseCount(others);
  if (used + adding > ESV_VERSE_LIMIT) {
    throw new Error(`This device already stores ${used} ESV verses. Adding this passage would pass 500. Export and delete an ESV study first.`);
  }
}

async function buildFromDraft(draft, replacing) {
  const reference = (draft.reference || "").trim();
  const clauseSplit = draft.clauses !== "no";
  if (draft.mode === "esv") {
    const result = await fetchEsvPassage(reference, state.settings.esvApiKey);
    if (result.esvVerseRefs.length > ESV_VERSE_LIMIT) {
      throw new Error("That passage is longer than the 500 verses Crossway allows an app to store.");
    }
    const nodes = nodesFromVerses(result.verses, { clauseSplit });
    if (nodes.length > MAX_PROPOSITIONS) throw new Error("That passage is too long for one study. Request a shorter reference.");
    assertRoom(esvVerseCount({ translation: "ESV", esvVerseRefs: result.esvVerseRefs }), replacing);
    return createStudy({
      title: (draft.title || "").trim() || result.canonical || reference,
      reference: result.canonical || reference,
      translation: "ESV",
      sourceText: result.sourceText,
      copyrightNotice: result.copyrightNotice || null,
      esvVerseRefs: result.esvVerseRefs,
      nodes,
      phrasing: { lines: linesFromNodes(nodes) },
    });
  }
  const verses = versesFromPlainText(draft.passage || "");
  if (!verses.length) throw new Error("Paste the passage first.");
  const nodes = nodesFromVerses(verses, { clauseSplit });
  if (!nodes.length) throw new Error("Paste the passage first.");
  if (nodes.length > MAX_PROPOSITIONS) throw new Error("That passage is too long for one study. Paste a shorter section.");
  return createStudy({
    title: (draft.title || "").trim() || reference || "Pasted passage",
    reference,
    translation: "paste",
    translationName: (draft.translationName || "").trim() || "Pasted",
    sourceText: verses.map((verse) => verse.text).join("\n\n"),
    nodes,
    phrasing: { lines: linesFromNodes(nodes) },
  });
}

function pathOf(study, id) {
  let found = null;
  const walk = (nodes, path) => {
    nodes.forEach((node, index) => {
      const next = path.concat(index);
      if (node.id === id) found = next;
      else if (node.type === "group") walk(node.children || [], next);
    });
  };
  walk(study.nodes || [], []);
  return found;
}

const handlers = {
  toggleEditing() {
    state.editing = state.editing === false;
    render();
  },
  toggleConj() {
    state.conj = state.conj === false;
    render();
  },
  async loadReference() {
    const ref = (document.getElementById("ref-input")?.value || state.loadRef || "").trim();
    state.loadRef = ref;
    if (!ref) {
      banner("Type a reference first.");
      return;
    }
    if (!state.settings.esvApiKey) {
      state.draft = { mode: "paste", reference: ref, title: ref, clauses: "yes", translationName: "Pasted" };
      openDialog({ type: "new" });
      return;
    }
    state.busy = true;
    render();
    try {
      const built = await buildFromDraft({ mode: "esv", reference: ref, title: "", clauses: "yes" }, false);
      state.studies.push(built);
      state.history = createHistory(built);
      state.dialog = null;
      state.busy = false;
      state.pending = null;
      state.pop = null;
      state.view = "brackets";
      state.loadRef = "";
      persist();
      render();
    } catch (error) {
      state.busy = false;
      banner(error.message || "That passage could not be loaded.");
    }
  },
  splitWord(index, wordIndex) {
    state.pending = null;
    state.pop = null;
    dispatch((study) => splitProposition(study, index, wordIndex));
  },
  rejoin(index) {
    state.pending = null;
    dispatch((study) => rejoinProposition(study, index));
  },
  connect(sel) {
    const pending = state.pending;
    if (!pending) {
      state.pending = sel;
      state.banner = null;
      render();
      return;
    }
    if (pending.start === sel.start && pending.end === sel.end) {
      state.pending = null;
      render();
      return;
    }
    const start = Math.min(pending.start, sel.start);
    const end = Math.max(pending.end, sel.end);
    state.pending = null;
    try {
      const result = drawBracket(current(), start, end);
      state.history = commit(state.history, result.study);
      state.notice = result.notice;
      state.banner = null;
      state.pop = null;
      persist();
      render();
    } catch (error) {
      state.notice = "";
      banner(error.message || "That bracket could not be drawn.");
    }
  },
  openRel(id, pos) {
    state.relQuery = "";
    state.focusPop = true;
    state.pop = { kind: "rel", id, x: pos.x, y: pos.y };
    render();
  },
  openPropNote(id, pos) {
    const path = pathOf(current(), id);
    const note = path ? getNode(current(), path)?.note || "" : "";
    state.focusPop = true;
    state.pop = { kind: "note", target: "prop", id, draft: note, x: pos.x, y: pos.y };
    render();
  },
  openBracketNote(id, pos) {
    const path = pathOf(current(), id);
    const note = path ? getNode(current(), path)?.note || "" : "";
    state.focusPop = true;
    state.pop = { kind: "note", target: "bracket", id, draft: note, x: pos.x, y: pos.y };
    render();
  },
  saveNote(text) {
    const pop = state.pop;
    if (!pop) return;
    const value = String(text ?? "").trim();
    state.pop = null;
    if (pop.target === "bracket") dispatch((study) => setBracketNote(study, pop.id, value));
    else {
      const path = pathOf(current(), pop.id);
      if (!path) return;
      dispatch((study) => setNodeNote(study, path, value));
    }
  },
  closePop() {
    state.pop = null;
    state.relQuery = "";
    render();
  },
  relQuery(value) {
    state.relQuery = value;
    state.focusPop = true;
    render();
  },
  pickRelation(id, relationId) {
    dispatch((study) => setBracketRelation(study, id, relationId));
  },
  flip(id) {
    dispatch((study) => flipBracket(study, id));
  },
  mainSide(id) {
    dispatch((study) => toggleMainSide(study, id));
  },
  deleteBracket(id) {
    state.pop = null;
    dispatch((study) => removeBracket(study, id));
  },
  setIndent(index, indent) {
    dispatch((study) => setIndent(study, index, indent));
  },
  splitLine(index, wordIndex) {
    const line = current().phrasing?.lines?.[index];
    if (!line) return;
    dispatch((study) => splitLine(study, index, charIndexOfWord(line.text, wordIndex)));
  },
  mergeLine(index) {
    dispatch((study) => mergeLineWithNext(study, index));
  },
  deleteLine(index) {
    dispatch((study) => deleteLine(study, index));
  },
  rebuildPhrasing() {
    const lines = current().phrasing?.lines || [];
    const run = () => {
      state.dialog = null;
      dispatch((study) => rebuildPhrasing(study));
    };
    if (lines.some((line) => line.note || line.indent)) {
      confirmDialog({
        title: "Rebuild phrasing lines?",
        message: "Indent and notes in the phrasing view will be replaced. Brackets and their notes stay.",
        confirmLabel: "Rebuild",
        onConfirm: run,
      });
      return;
    }
    run();
  },
  undo() {
    if (!canUndo(state.history)) return;
    state.history = undo(state.history);
    if (!selectionStillValid(current(), state.selection)) state.selection = null;
    state.noteEditor = null;
    state.notice = "";
    state.pending = null;
    state.pop = null;
    persist();
    render();
  },
  redo() {
    if (!canRedo(state.history)) return;
    state.history = redo(state.history);
    if (!selectionStillValid(current(), state.selection)) state.selection = null;
    state.noteEditor = null;
    state.notice = "";
    state.pending = null;
    state.pop = null;
    persist();
    render();
  },
  setView(view) {
    state.view = view;
    state.sheet = false;
    state.pending = null;
    state.pop = null;
    render();
  },
  toggleTheme() {
    state.settings.theme = resolveTheme(state.settings.theme) === "dark" ? "light" : "dark";
    saveSettings(state.settings, storage);
    render();
  },
  openDialog,
  closeDialog,
  dismissBanner() {
    state.banner = null;
    render();
  },
  rememberDraft(form) {
    state.draft = draftObject(form);
    render();
  },
  async submitStudy(form) {
    state.draft = draftObject(form);
    const replacing = state.dialog?.type === "replace";
    state.busy = true;
    render();
    try {
      const built = await buildFromDraft(state.draft, replacing);
      if (replacing) {
        const previous = current();
        const next = {
          ...built,
          id: previous.id,
          title: previous.title,
          note: previous.note,
          createdAt: previous.createdAt,
        };
        state.history = commit(state.history, next);
      } else {
        state.studies.push(built);
        state.history = createHistory(built);
      }
      state.dialog = null;
      state.draft = null;
      state.busy = false;
      state.selection = null;
      state.view = "brackets";
      persist();
      render();
    } catch (error) {
      state.busy = false;
      banner(error.message || "That passage could not be loaded.");
    }
  },
  saveSettings(form) {
    const theme = form.get("theme");
    state.settings.esvApiKey = String(form.get("esvApiKey") || "").trim();
    state.settings.theme = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
    saveSettings(state.settings, storage);
    state.dialog = null;
    banner(state.settings.esvApiKey ? "Settings saved on this device." : "Settings saved. Paste still works without a key.");
  },
  forgetKey() {
    state.settings.esvApiKey = "";
    saveSettings(state.settings, storage);
    banner("The ESV key was removed from this device.");
  },
  filterStudies(value) {
    state.studyQuery = value;
    render();
  },
  openStudy(id) {
    const found = state.studies.find((study) => study.id === id);
    if (!found) return;
    state.history = createHistory(structuredClone(found));
    state.selection = null;
    state.dialog = null;
    state.view = "brackets";
    persist();
    render();
  },
  duplicate(id) {
    const found = state.studies.find((study) => study.id === id);
    if (!found) return;
    const copy = structuredClone(found);
    copy.id = uid();
    copy.title = `Copy of ${found.title}`.slice(0, 200);
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    const plan = planImport(state.studies, [copy]);
    if (!plan.accepted.length) {
      banner(plan.skipped[0]?.reason || "That copy could not be stored.");
      return;
    }
    state.studies.push(plan.accepted[0]);
    state.history = createHistory(structuredClone(plan.accepted[0]));
    state.dialog = null;
    state.pending = null;
    state.pop = null;
    persist();
    render();
  },
  deleteStudy(id) {
    const found = state.studies.find((study) => study.id === id);
    if (!found) return;
    confirmDialog({
      title: "Delete this study?",
      message: `“${found.title}” will be removed from this device. Export it first if you want a copy.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        state.studies = state.studies.filter((study) => study.id !== id);
        if (!state.studies.length) state.studies.push(sampleStudy());
        if (current().id === id) state.history = createHistory(structuredClone(state.studies[0]));
        state.dialog = null;
        state.selection = null;
        saveStudies(state.studies, storage);
        saveSettings({ ...state.settings, activeStudyId: current().id }, storage);
        render();
      },
    });
  },
  exportStudy(id) {
    const study = id ? state.studies.find((item) => item.id === id) : current();
    if (!study) return;
    shareOrDownload(`${slug(study.reference || study.title)}.json`, exportStudyFile(study));
  },
  exportAll() {
    shareOrDownload("textlab-studies.json", exportLibraryFile(state.studies));
  },
  import() {
    fileInput.click();
  },
  async importChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = readTransfer(data);
      const plan = planImport(state.studies, incoming);
      if (plan.accepted.length) {
        state.studies.push(...plan.accepted);
        state.history = createHistory(structuredClone(plan.accepted[0]));
        state.selection = null;
        state.dialog = null;
        persist();
      }
      const skipped = plan.skipped.length ? ` Skipped ${plan.skipped.length}: ${plan.skipped[0].reason}` : "";
      banner(`Imported ${plan.accepted.length} ${plan.accepted.length === 1 ? "study" : "studies"}.${skipped}`);
    } catch (error) {
      banner(error.message || "That file could not be imported.");
    }
  },
  print() {
    state.dialog = null;
    render();
    setTimeout(() => window.print(), 50);
  },
  downloadSvg() {
    const study = current();
    const svg = state.view === "phrasing" ? renderPhrasingSvg(study) : renderSvg(study);
    downloadBlob(`${slug(study.reference || study.title)}.svg`, new Blob([svg], { type: "image/svg+xml" }));
  },
  async copyOutline() {
    const text = toOutline(current());
    try {
      await navigator.clipboard.writeText(text);
      banner("Outline copied.");
    } catch {
      downloadBlob(`${slug(current().title)}.txt`, new Blob([text], { type: "text/plain" }));
    }
  },
  clearBrackets() {
    confirmDialog({
      title: "Clear brackets?",
      message: "The propositions stay. Bracket labels and bracket notes are removed. You can undo this.",
      confirmLabel: "Clear brackets",
      onConfirm: () => {
        state.dialog = null;
        dispatch((study) => clearBrackets(study), () => {
          state.selection = null;
        });
      },
    });
  },
  startRename() {
    state.renaming = true;
    state.focusNote = false;
    render();
    document.getElementById("title-input")?.focus();
  },
  rename(value) {
    state.renaming = false;
    state.titleDraft = null;
    if (value.trim() === current().title || (!value.trim() && current().title === "Untitled study")) {
      render();
      return;
    }
    dispatch((study) => setTitle(study, value));
  },
};

fileInput.addEventListener("change", (event) => handlers.importChosen(event));

function slug(value) {
  return String(value || "study").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "study";
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareOrDownload(filename, data) {
  const text = JSON.stringify(data, null, 2);
  const file = new File([text], filename, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  downloadBlob(filename, new Blob([text], { type: "application/json" }));
}

function boot() {
  const loaded = [];
  for (const item of loadStudies(storage)) {
    try {
      loaded.push(validateStudy(item));
    } catch {
      /* Keep going. A damaged study should not hide the rest. */
    }
  }
  state.studies = loaded.length ? loaded : [sampleStudy()];
  if (!loaded.length) saveStudies(state.studies, storage);
  const active = state.studies.find((study) => study.id === state.settings.activeStudyId) || state.studies[0];
  state.history = createHistory(structuredClone(active));
  document.addEventListener("click", () => {
    if (!state.pop) return;
    state.pop = null;
    state.relQuery = "";
    render();
  });
  window.addEventListener("resize", () => {
    const narrow = window.innerWidth < 700;
    if (narrow !== state.wasNarrow) {
      state.wasNarrow = narrow;
      render();
    } else {
      paintGutter(state, handlers);
    }
  });
  state.wasNarrow = window.innerWidth < 700;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.pop) {
        handlers.closePop();
        return;
      }
      if (state.pending) {
        state.pending = null;
        state.banner = null;
        render();
        return;
      }
      if (state.dialog) {
        handlers.closeDialog();
        return;
      }
      return;
    }
    const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, select");
    if (!typing && event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      handlers.toggleEditing();
      return;
    }
    if (typing) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) handlers.redo();
      else handlers.undo();
    } else if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      handlers.redo();
    }
  });
  window.addEventListener("online", () => {
    state.offline = false;
    render();
  });
  window.addEventListener("offline", () => {
    state.offline = true;
    render();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "system") render();
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  render();
}

boot();
