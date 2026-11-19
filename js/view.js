import { findGroup, layoutTree, armsOf } from "./brackets.js";
import { studyCopyright, STANDARD_ESV_NOTICE } from "./esv.js";
import { ESV_VERSE_LIMIT, libraryVerseCount } from "./model.js";
import {
  CATEGORIES,
  RELATIONSHIPS,
  categoryOf,
  getRelationship,
  labelsOf,
  leadingConjunction,
  mainSideOf,
  matchRelationships,
  tokensOf,
} from "./relationships.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function savedLabel(study) {
  const when = Date.parse(study?.updatedAt || "");
  if (!Number.isFinite(when)) return "Saved";
  const mins = Math.floor((Date.now() - when) / 60000);
  if (mins < 1) return "Saved just now";
  if (mins < 60) return `Saved ${mins} min ago`;
  return `Saved ${new Date(when).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function anchor(event) {
  const rect = (event.currentTarget || event.target).getBoundingClientRect();
  const hasBox = rect.width || rect.height;
  const x = hasBox ? rect.left : event.clientX || 0;
  const y = hasBox ? rect.bottom + 6 : (event.clientY || 0) + 6;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 346)),
    y: Math.max(8, Math.min(y, window.innerHeight - 120)),
  };
}

function renderWords(prop, index, editing, conjOn, handlers) {
  const tokens = tokensOf(prop.text);
  const mark = conjOn ? leadingConjunction(tokens) : null;
  const box = el("div", { class: "ptext" });
  tokens.forEach((token, wordIndex) => {
    if (wordIndex) box.append(document.createTextNode(" "));
    const classes = ["w"];
    if (mark && wordIndex < mark.count) classes.push("cj", `cj-${mark.cat}`);
    const canSplit = editing && wordIndex > 0;
    if (canSplit) classes.push("can-split");
    if (canSplit) {
      box.append(el("button", {
        type: "button",
        class: classes.join(" "),
        text: token,
        title: "Start a new proposition here",
        onClick: (event) => {
          event.stopPropagation();
          handlers.splitWord(index, wordIndex);
        },
      }));
    } else {
      box.append(el("span", { class: classes.join(" "), text: token }));
    }
  });
  if (prop.note) {
    box.append(el("button", {
      type: "button",
      class: "notepin",
      title: prop.note,
      "aria-label": "Note",
      onClick: (event) => {
        event.stopPropagation();
        handlers.openPropNote(prop.id, anchor(event));
      },
    }));
  } else if (editing) {
    box.append(el("button", {
      type: "button",
      class: "addnote",
      text: "＋",
      title: "Add a note",
      onClick: (event) => {
        event.stopPropagation();
        handlers.openPropNote(prop.id, anchor(event));
      },
    }));
  }
  return box;
}

function renderDiagram(study, state, handlers) {
  const layout = layoutTree(study.nodes);
  const narrow = window.innerWidth < 700;
  const colW = narrow ? 26 : 46;
  const gutW = layout.maxCol * colW + 16;
  const editing = state.editing !== false;
  const rows = layout.props.map((prop, index) => el("div", {
    class: `row${layout.firstOfVerse[index] ? "" : " merge-top"}`,
    "data-i": String(index),
  }, [
    editing && !layout.firstOfVerse[index]
      ? el("button", {
          type: "button",
          class: "unjoin",
          text: "✕",
          title: "Rejoin with the line above",
          onClick: (event) => {
            event.stopPropagation();
            handlers.rejoin(index);
          },
        })
      : null,
    el("span", { class: "vlabel", text: layout.labels[index] || "" }),
    renderWords(prop, index, editing, state.conj !== false, handlers),
  ]));
  return el("div", { class: `diagram${editing ? " editing" : ""}`, id: "diagram" }, [
    el("div", {
      class: "diagram-inner",
      id: "diagram-inner",
      style: `padding-left:${gutW}px`,
      "data-col": String(colW),
    }, [
      svgEl("svg", { class: "gutter", id: "gutter", width: String(gutW), height: "1" }),
      el("div", { class: "rows" }, rows),
    ]),
  ]);
}

function renderPhrasing(study, handlers) {
  const lines = study.phrasing?.lines || [];
  if (!lines.length) {
    return el("div", { class: "empty" }, [
      el("p", { text: "No phrasing lines yet." }),
      el("button", { type: "button", class: "pbtn", text: "Build lines from the propositions", onClick: handlers.rebuildPhrasing }),
    ]);
  }
  return el("div", { class: "phrases" }, [
    el("p", { class: "hint-line", text: "Indent a line under the line it supports. Tap a later word to split a line. Phrasing has no arrows." }),
    ...lines.map((line, index) => {
      const text = el("div", { class: "phrase-text", style: `--indent:${line.indent || 0}` });
      const tokens = tokensOf(line.text);
      tokens.forEach((token, wordIndex) => {
        if (wordIndex) text.append(document.createTextNode(" "));
        if (wordIndex === 0) text.append(el("span", { class: "w", text: token }));
        else {
          text.append(el("button", {
            type: "button",
            class: "w can-split",
            text: token,
            title: "Start a new line here",
            onClick: () => handlers.splitLine(index, wordIndex),
          }));
        }
      });
      return el("article", { class: "phrase-line" }, [
        el("div", { class: "indent-row" }, [
          el("button", { type: "button", class: "indent-btn", text: "‹", "aria-label": "Outdent", disabled: !line.indent, onClick: () => handlers.setIndent(index, (line.indent || 0) - 1) }),
          el("button", { type: "button", class: "indent-btn", text: "›", "aria-label": "Indent", onClick: () => handlers.setIndent(index, (line.indent || 0) + 1) }),
        ]),
        el("div", { style: "flex:1" }, [
          text,
          line.note ? el("p", { class: "phrase-note", text: line.note }) : null,
          el("button", { type: "button", class: "quiet", text: "Merge with next", onClick: () => handlers.mergeLine(index) }),
        ]),
      ]);
    }),
  ]);
}

function renderPopover(state, handlers) {
  const pop = state.pop;
  if (!pop) return null;
  const study = state.history.present;
  const box = el("div", {
    class: "pop",
    style: `left:${pop.x}px;top:${pop.y}px`,
    onClick: (event) => event.stopPropagation(),
  });
  if (pop.kind === "rel") {
    const group = findGroup(study, pop.id);
    if (!group) return null;
    const layout = layoutTree(study.nodes);
    const indexes = [];
    const pull = (node) => {
      if (node.type === "prop") indexes.push(layout.props.findIndex((prop) => prop.id === node.id));
      else (node.children || []).forEach(pull);
    };
    pull(group);
    const start = Math.min(...indexes.filter((index) => index >= 0));
    const end = Math.max(...indexes.filter((index) => index >= 0));
    const from = layout.labels[start] || "";
    const to = layout.labels[end] || "";
    box.append(
      el("h3", { text: `Bracket · ${from}–${to}` }),
      el("div", { class: "popbar" }, [
        el("button", { type: "button", class: "sbtn", title: "Swap which half is which", text: "⇅ Flip", onClick: () => handlers.flip(pop.id) }),
        el("button", { type: "button", class: "sbtn", title: "Move the head line to the other arm", text: "⇥ Main side", onClick: () => handlers.mainSide(pop.id) }),
        el("button", { type: "button", class: "sbtn", text: "Note", onClick: (event) => handlers.openBracketNote(pop.id, anchor(event)) }),
        el("button", { type: "button", class: "sbtn dbtn", text: "Delete", onClick: () => handlers.deleteBracket(pop.id) }),
      ]),
    );
    const hits = matchRelationships(state.relQuery || "");
    const shown = [];
    const search = el("input", {
      id: "rel-search",
      class: "relsearch",
      type: "search",
      placeholder: "Search name, abbreviation, or conjunction",
      "aria-label": "Search relationships",
      autocomplete: "off",
      spellcheck: "false",
      onInput: (event) => handlers.relQuery(event.target.value),
      onKeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (shown.length) handlers.pickRelation(pop.id, shown[0].id);
        }
        if (event.key === "Escape" && state.relQuery) {
          event.stopPropagation();
          handlers.relQuery("");
        }
      },
    });
    search.value = state.relQuery || "";
    box.append(search);
    const buttonFor = (rel) => {
      shown.push(rel);
      const cat = categoryOf(rel.category);
      const top = state.relQuery && shown.length === 1;
      return el("button", {
        type: "button",
        class: `relitem c-${cat?.key || "coord"}${top ? " top" : ""}`,
        "aria-current": group.relation === rel.id ? "true" : "false",
        onClick: () => handlers.pickRelation(pop.id, rel.id),
      }, [
        el("span", { class: "abbr", text: rel.abbr }),
        el("span", {}, [
          el("span", { class: "nm", text: rel.name + (rel.extended ? " ·" : "") }),
          el("span", { class: "df", text: rel.definition }),
          rel.hints ? el("span", { class: "cn", text: rel.hints }) : null,
        ]),
      ]);
    };
    if (state.relQuery) {
      box.append(el("div", { class: "relgroup" }, [
        el("span", { text: `${hits.length} match${hits.length === 1 ? "" : "es"}` }),
        ...hits.map(buttonFor),
      ]));
    } else {
      for (const category of CATEGORIES) {
        const inCat = hits.filter((rel) => rel.category === category.id);
        if (!inCat.length) continue;
        box.append(el("div", { class: "relgroup" }, [
          el("span", { text: category.label }),
          ...inCat.map(buttonFor),
        ]));
      }
    }
    if (!hits.length) {
      box.append(el("p", { class: "hint-line", text: `Nothing matches “${state.relQuery}”. Try a conjunction like “because” or “so that”.` }));
    }
  } else if (pop.kind === "note") {
    const area = el("textarea", { id: "pop-note", class: "popnote", rows: "5", placeholder: "Insight or question…" });
    area.value = pop.draft ?? "";
    box.append(
      el("h3", { text: "Note" }),
      area,
      el("div", { class: "row-btns" }, [
        el("button", { type: "button", class: "pbtn", text: "Save", onClick: () => handlers.saveNote(area.value) }),
        el("button", { type: "button", class: "sbtn", text: "Cancel", onClick: handlers.closePop }),
      ]),
    );
  }
  return box;
}

function field(label, control) {
  return el("label", {}, [label, control]);
}

function input(attrs, value) {
  const node = el("input", attrs);
  if (value != null) node.value = value;
  return node;
}

function renderNewStudy(state, handlers) {
  const draft = state.draft || {};
  const mode = draft.mode || (state.settings.esvApiKey ? "esv" : "paste");
  const passage = el("textarea", { name: "passage", rows: "8", "aria-label": "Passage text" });
  passage.value = draft.passage || "";
  return el("form", {
    class: "grid",
    id: "new-study-form",
    onSubmit: (event) => {
      event.preventDefault();
      handlers.submitStudy(new FormData(event.currentTarget));
    },
    onChange: (event) => {
      if (event.target.name === "mode") handlers.rememberDraft(new FormData(event.currentTarget));
    },
  }, [
    field("Title", input({ name: "title", type: "text", autocomplete: "off" }, draft.title || "")),
    field("Reference", input({ name: "reference", type: "text", placeholder: "John 3:16", autocomplete: "off", autocapitalize: "off" }, draft.reference || state.loadRef || "")),
    el("div", { class: "choice" }, [
      el("label", {}, [input({ type: "radio", name: "mode", value: "esv", checked: mode === "esv" ? true : null }), "Look up the ESV"]),
      el("label", {}, [input({ type: "radio", name: "mode", value: "paste", checked: mode === "paste" ? true : null }), "Paste text"]),
    ]),
    mode === "esv" && !state.settings.esvApiKey
      ? el("p", { class: "hint-line", text: "Add your ESV API key under Key first, or paste the passage." })
      : null,
    el("div", { hidden: mode !== "paste" }, [
      field("Passage", passage),
      field("Translation label", input({ name: "translationName", type: "text" }, draft.translationName || "Pasted")),
    ]),
    el("label", { class: "choice" }, [
      input({ type: "checkbox", name: "clauses", value: "yes", checked: draft.clauses === "no" ? null : true }),
      "Divide into clauses",
    ]),
    el("button", { type: "submit", class: "pbtn", text: state.busy ? "Working…" : mode === "esv" ? "Look up" : "Create study", disabled: state.busy }),
  ]);
}

function renderDialog(state, handlers) {
  const dialog = state.dialog;
  if (!dialog) return null;
  let body = [];
  let title = "";
  if (dialog.type === "studies") {
    title = "Studies";
    const query = state.studyQuery || "";
    const studies = [...state.studies].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const filtered = studies.filter((study) => `${study.title} ${study.reference}`.toLowerCase().includes(query.trim().toLowerCase()));
    const filter = input({ id: "study-filter", type: "text", placeholder: "Search studies", autocomplete: "off" }, query);
    filter.addEventListener("input", (event) => handlers.filterStudies(event.target.value));
    body = [
      filter,
      el("div", { class: "action-row" }, [
        el("button", { type: "button", class: "pbtn", text: "New study", onClick: () => handlers.openDialog({ type: "new" }) }),
        el("button", { type: "button", class: "tbtn", text: "Import", onClick: handlers.import }),
      ]),
      ...filtered.map((study) => el("div", { class: "study-row" }, [
        el("button", { type: "button", class: "grow", onClick: () => handlers.openStudy(study.id) }, [
          el("strong", { text: study.title }),
          el("br"),
          el("small", { text: [study.reference, study.translationName].filter(Boolean).join(" · ") }),
        ]),
        el("button", { type: "button", class: "quiet", text: "Copy", onClick: () => handlers.duplicate(study.id) }),
        el("button", { type: "button", class: "quiet", text: "Export", onClick: () => handlers.exportStudy(study.id) }),
        el("button", { type: "button", class: "quiet danger", text: "Delete", onClick: () => handlers.deleteStudy(study.id) }),
      ])),
      filtered.length ? null : el("p", { text: "No studies match that search." }),
    ];
  } else if (dialog.type === "new" || dialog.type === "replace") {
    title = dialog.type === "new" ? "New study" : "Replace passage";
    body = [renderNewStudy(state, handlers)];
  } else if (dialog.type === "settings") {
    title = "ESV API key";
    const used = libraryVerseCount(state.studies);
    const key = input({
      name: "esvApiKey",
      type: "text",
      autocomplete: "off",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      "aria-label": "ESV API key",
    }, state.settings.esvApiKey || "");
    const theme = el("select", { name: "theme" }, [
      el("option", { value: "system", text: "Match the system" }),
      el("option", { value: "light", text: "Light" }),
      el("option", { value: "dark", text: "Dark" }),
    ]);
    theme.value = state.settings.theme || "system";
    body = [
      el("form", {
        class: "grid",
        id: "settings-form",
        onSubmit: (event) => {
          event.preventDefault();
          handlers.saveSettings(new FormData(event.currentTarget));
        },
      }, [
        el("p", { text: "The key is saved only in this browser. It is sent to api.esv.org when you look up a passage, and it is not included in an export." }),
        field("ESV API key", key),
        el("p", {}, [
          el("a", { href: "https://api.esv.org/account/create-application/", target: "_blank", rel: "noopener noreferrer", text: "Create a free ESV API key" }),
        ]),
        field("Appearance", theme),
        el("button", { type: "submit", class: "pbtn", text: "Save settings" }),
      ]),
      el("button", { type: "button", class: "quiet", text: "Forget the key on this device", onClick: handlers.forgetKey }),
      el("p", { class: "hint-line", text: `${used} of ${ESV_VERSE_LIMIT} ESV verses stored on this device.` }),
      el("h3", { text: "ESV copyright" }),
      el("p", { class: "hint-line", text: STANDARD_ESV_NOTICE }),
    ];
  } else if (dialog.type === "file") {
    title = "Export";
    const item = (text, onClick) => el("button", { type: "button", class: "tbtn", text, onClick });
    body = [
      el("div", { class: "grid" }, [
        item("Export this study", () => handlers.exportStudy()),
        item("Export all studies", handlers.exportAll),
        item("Import", handlers.import),
        item("Print or save as PDF", handlers.print),
        item("Download diagram (SVG)", handlers.downloadSvg),
        item("Copy outline", handlers.copyOutline),
        item("Clear brackets", handlers.clearBrackets),
        item("Replace the passage", () => handlers.openDialog({ type: "replace" })),
      ]),
    ];
  } else if (dialog.type === "guide") {
    title = "The logical relationships";
    body = [
      el("p", { text: "Biblearc’s taxonomy. The four marked · are the optional extended relationships. An unlabeled bracket stays grey." }),
      ...CATEGORIES.map((category) => el("section", { class: "relgroup" }, [
        el("span", { class: "rel-label", text: `${category.label} — ${category.blurb}` }),
        ...RELATIONSHIPS.filter((item) => item.category === category.id).map((item) => el("div", { class: `relitem c-${category.key}` }, [
          el("span", { class: "abbr", text: item.abbr }),
          el("span", {}, [
            el("span", { class: "nm", text: item.name + (item.extended ? " ·" : "") }),
            el("span", { class: "df", text: item.definition }),
            item.hints ? el("span", { class: "cn", text: item.hints }) : null,
          ]),
        ])),
      ])),
    ];
  } else if (dialog.type === "confirm") {
    title = dialog.title;
    body = [
      el("p", { text: dialog.message }),
      el("div", { class: "action-row" }, [
        el("button", { type: "button", class: "pbtn", text: dialog.confirmLabel || "Confirm", onClick: dialog.onConfirm }),
        el("button", { type: "button", class: "tbtn", text: "Cancel", onClick: handlers.closeDialog }),
      ]),
    ];
  }
  return el("div", { class: "dialog-backdrop", onClick: (event) => { if (event.target === event.currentTarget) handlers.closeDialog(); } }, [
    el("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title }, [
      el("div", { class: "action-row" }, [
        el("h2", { text: title }),
        el("button", { type: "button", class: "quiet", text: "Close", onClick: handlers.closeDialog }),
      ]),
      ...body,
    ]),
  ]);
}

function renderCopyright(study) {
  const credit = "The bracketing method and the eighteen logical relationships are Biblearc’s. The four extended relationships are Biblearc’s optional set. This is an independent tool for personal study.";
  if (study.translation === "ESV") {
    return el("footer", { class: "copyright" }, [
      el("p", { text: studyCopyright(study) || STANDARD_ESV_NOTICE }),
      el("p", {}, [
        "ESV text from ",
        el("a", { href: "https://www.esv.org/", target: "_blank", rel: "noopener noreferrer", text: "ESV.org" }),
        ". Stored on this device, within Crossway’s 500-verse limit.",
      ]),
      el("p", { text: credit }),
    ]);
  }
  const name = study.translationName || "Pasted";
  return el("footer", { class: "copyright" }, [
    el("p", { text: `${name} text, entered on this device. It was not fetched from the ESV API.` }),
    el("p", { text: credit }),
  ]);
}

export function renderApp(state, handlers) {
  const study = state.history.present;
  const editing = state.editing !== false;
  const layout = layoutTree(study.nodes);
  const bracketCount = layout.forest.length ? countGroups(study.nodes) : 0;
  const ref = el("input", {
    id: "ref-input",
    type: "text",
    placeholder: "Ephesians 4:20-24",
    "aria-label": "Passage reference",
    autocomplete: "off",
    autocapitalize: "off",
    onInput: (event) => { state.loadRef = event.target.value; },
    onKeydown: (event) => { if (event.key === "Enter") { event.preventDefault(); handlers.loadReference(); } },
  });
  ref.value = state.loadRef || "";
  const title = el("input", {
    id: "title-input",
    class: "titleinput",
    "aria-label": "Study name",
    spellcheck: "false",
    autocomplete: "off",
    size: String(Math.max(12, Math.min(46, (state.titleDraft ?? study.title).length + 1))),
    onInput: (event) => {
      state.titleDraft = event.target.value;
      event.target.size = Math.max(12, Math.min(46, event.target.value.length + 1));
    },
    onBlur: (event) => handlers.rename(event.target.value),
  });
  title.value = state.titleDraft ?? study.title;
  const phrasing = state.view === "phrasing";
  return el("div", { class: `app${editing ? " editing" : ""}` }, [
    state.banner ? el("div", { class: "alarm", role: "status" }, [
      state.banner.text,
      el("button", { type: "button", class: "banner-link", text: "Dismiss", onClick: handlers.dismissBanner }),
    ]) : null,
    state.offline ? el("div", { class: "alarm", text: "Offline. Saved studies still open. ESV lookup needs a connection." }) : null,
    state.storageWarning ? el("div", { class: "alarm", text: state.storageWarning }) : null,
    el("header", { class: "topbar" }, [
      el("button", { type: "button", class: "brand", onClick: () => handlers.openDialog({ type: "studies" }) }, ["Text", el("span", { text: "Lab" })]),
      el("form", { class: "refform", onSubmit: (event) => { event.preventDefault(); handlers.loadReference(); } }, [
        ref,
        el("button", { type: "submit", text: "Load", disabled: state.busy }),
      ]),
      el("div", { class: "spacer" }),
      el("button", {
        type: "button",
        class: "tbtn",
        "aria-pressed": editing ? "true" : "false",
        title: "Spacebar",
        onClick: handlers.toggleEditing,
      }, ["Editing ", el("span", { class: "kbd", text: "space" })]),
      el("button", {
        type: "button",
        class: "tbtn",
        "aria-pressed": state.conj === false ? "false" : "true",
        onClick: handlers.toggleConj,
        text: "Conjunctions",
      }),
      el("button", { type: "button", class: "tbtn", text: window.innerWidth < 700 ? "＋ New" : "＋ New study", onClick: () => handlers.openDialog({ type: "new" }) }),
      el("button", { type: "button", class: "tbtn", text: "Relationships", onClick: () => handlers.openDialog({ type: "guide" }) }),
      el("button", { type: "button", class: "tbtn", text: `Studies · ${state.studies.length}`, onClick: () => handlers.openDialog({ type: "studies" }) }),
      el("button", { type: "button", class: "tbtn", text: "Export", onClick: () => handlers.openDialog({ type: "file" }) }),
      el("button", { type: "button", class: "tbtn", text: "Key", onClick: () => handlers.openDialog({ type: "settings" }) }),
      el("button", {
        type: "button",
        class: "tbtn themebtn",
        title: state.resolved === "dark" ? "Dark" : "Light",
        "aria-label": "Theme",
        text: state.resolved === "dark" ? "☾" : "☀",
        onClick: handlers.toggleTheme,
      }),
    ]),
    el("main", { class: "sheet-wrap" }, [
      el("div", { class: "sheet" }, [
        el("div", { class: "study-head" }, [
          title,
          el("span", { class: "meta", text: phrasing ? plural(study.phrasing?.lines?.length || 0, "line") : `${plural(layout.props.length, "proposition")} · ${plural(bracketCount, "bracket")}` }),
          el("span", { class: "saved", text: savedLabel(study) }),
        ]),
        el("div", { class: "headrow" }, [
          el("div", { class: "layertabs", role: "tablist" }, [
            el("button", { type: "button", class: "layertab", "aria-current": state.view !== "phrasing" ? "true" : "false", text: "Bracketing", onClick: () => handlers.setView("brackets") }),
            el("button", { type: "button", class: "layertab", "aria-current": phrasing ? "true" : "false", text: "Phrasing", onClick: () => handlers.setView("phrasing") }),
          ]),
          el("button", { type: "button", class: "sbtn", title: "Keep this one and continue in a copy", text: "Save a copy", onClick: () => handlers.duplicate(study.id) }),
          el("button", { type: "button", class: "sbtn", text: "Undo", disabled: !state.canUndo, onClick: handlers.undo }),
          el("button", { type: "button", class: "sbtn", text: "Redo", disabled: !state.canRedo, onClick: handlers.redo }),
        ]),
        state.notice ? el("div", { class: "notice", role: "status" }, [
          state.notice,
          el("button", { type: "button", class: "banner-link", text: "Undo", onClick: handlers.undo }),
        ]) : null,
        study.nodes.length
          ? phrasing ? renderPhrasing(study, handlers) : renderDiagram(study, state, handlers)
          : el("div", { class: "empty" }, [
              el("h2", { text: "Add a passage" }),
              el("p", { text: "Look up an ESV reference, or paste any text. Paste works without an API key." }),
              el("button", { type: "button", class: "pbtn", text: "New study", onClick: () => handlers.openDialog({ type: "new" }) }),
            ]),
        editing && !phrasing ? el("p", { class: "hint" }, [
          el("span", {}, [el("b", { text: "Split " }), "click a word to start a new proposition"]),
          el("span", {}, [el("b", { text: "Bracket " }), "click a dot, then a second dot — a bracket’s own dot connects it whole"]),
          el("span", {}, [el("b", { text: "Label " }), "click a bracket or its label"]),
          el("span", {}, [el("b", { text: "Note " }), "the ＋ at the right of a row"]),
        ]) : null,
        study.note ? el("p", { class: "passage-foot", text: study.note }) : null,
      ]),
    ]),
    renderCopyright(study),
    renderPopover(state, handlers),
    renderDialog(state, handlers),
  ]);
}

function countGroups(nodes) {
  let count = 0;
  for (const node of nodes || []) {
    if (node.type === "group") {
      count += 1;
      count += countGroups(node.children);
    }
  }
  return count;
}

let rowObserver = null;

export function paintGutter(state, handlers) {
  const svg = document.getElementById("gutter");
  if (!svg) return;
  const inner = document.getElementById("diagram-inner");
  if (!inner) return;
  if (rowObserver) rowObserver.disconnect();
  rowObserver = new ResizeObserver(() => drawGutter(state, handlers));
  rowObserver.observe(inner);
  drawGutter(state, handlers);
}

function drawGutter(state, handlers) {
  const svg = document.getElementById("gutter");
  const inner = document.getElementById("diagram-inner");
  if (!svg || !inner) return;
  const study = state.history.present;
  const rows = [...inner.querySelectorAll(".row")];
  const base = inner.getBoundingClientRect();
  const geom = rows.map((row) => {
    const box = row.getBoundingClientRect();
    return { top: box.top - base.top, bottom: box.bottom - base.top, mid: (box.top + box.bottom) / 2 - base.top };
  });
  const height = Math.max(1, inner.getBoundingClientRect().height);
  const gutW = parseFloat(inner.style.paddingLeft) || 16;
  const colW = Number(inner.dataset.col) || 46;
  const narrow = colW < 40;
  svg.setAttribute("width", String(gutW));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${gutW} ${height}`);
  const layout = layoutTree(study.nodes);
  const headY = (node) => {
    if (!node) return 0;
    if (node.type === "p") return geom[node.i] ? geom[node.i].mid : 0;
    const { first, last } = armsOf(node);
    const top = headY(first);
    const bottom = headY(last);
    const side = mainSideOf(node.group);
    if (side === "mid") return (top + bottom) / 2;
    return side === "top" ? top : bottom;
  };
  const nodeX = (node) => (node.type === "p" ? gutW : gutW - node.col * colW);
  const parts = [];
  const stroke = (color) => `stroke:${color};stroke-width:2.2;stroke-linecap:square;fill:none`;
  const editing = state.editing !== false;
  const pending = state.pending;
  const isPending = (start, end) => pending && pending.start === start && pending.end === end;
  const spanOf = (node) => {
    let start = Infinity;
    let end = -1;
    const visit = (current) => {
      if (current.type === "p") {
        start = Math.min(start, current.i);
        end = Math.max(end, current.i);
        return;
      }
      (current.children || []).forEach(visit);
    };
    visit(node);
    return { start, end };
  };
  const walk = (node) => {
    if (node.type !== "b") return;
    node.children.forEach(walk);
    const { first, last, drawn } = armsOf(node);
    const x = nodeX(node);
    const yTop = headY(first);
    const yBot = headY(last);
    const rel = getRelationship(node.group.relation);
    const cat = rel ? categoryOf(rel.category) : null;
    const labelColor = cat ? `var(--${cat.key})` : "var(--unset)";
    const lineColor = rel ? "var(--line)" : "var(--unset)";
    parts.push(svgEl("line", { x1: x, y1: yTop, x2: x, y2: yBot, style: stroke(lineColor) }));
    for (const child of drawn) {
      const y = headY(child);
      parts.push(svgEl("line", { x1: x, y1: y, x2: nodeX(child), y2: y, style: stroke(lineColor) }));
    }
    const labels = labelsOf(node.group);
    const put = (text, y) => {
      if (!text) return;
      parts.push(svgEl("text", {
        class: "hit",
        x: x + (narrow ? 5 : 9),
        y: y - 6,
        text,
        style: `fill:${labelColor};font-family:var(--sans);font-size:${narrow ? 11 : 13}px;font-weight:600;cursor:pointer`,
        onClick: (event) => {
          event.stopPropagation();
          handlers.openRel(node.group.id, anchor(event));
        },
      }));
    };
    if (labels.center) put(labels.center, (yTop + yBot) / 2 + 12);
    else {
      put(labels.top, yTop);
      put(labels.bottom, yBot);
    }
    if (!rel) put("?", (yTop + yBot) / 2 + 12);
    parts.push(svgEl("rect", {
      class: "hit",
      x: x - 7,
      y: yTop - 2,
      width: 14,
      height: Math.max(6, yBot - yTop + 4),
      style: "fill:transparent;cursor:pointer",
      onClick: (event) => {
        event.stopPropagation();
        handlers.openRel(node.group.id, anchor(event));
      },
    }));
    if (node.group.note) {
      parts.push(svgEl("circle", {
        class: "hit",
        cx: x - 9,
        cy: yTop + 9,
        r: 4,
        style: "fill:var(--gold);cursor:pointer",
        onClick: (event) => {
          event.stopPropagation();
          handlers.openBracketNote(node.group.id, anchor(event));
        },
      }));
    }
    if (editing) {
      const cy = headY(node);
      const span = spanOf(node);
      const on = isPending(span.start, span.end);
      parts.push(svgEl("circle", {
        class: "hit",
        cx: x,
        cy,
        r: narrow ? 12 : 9,
        style: "fill:transparent;cursor:pointer",
        onClick: (event) => {
          event.stopPropagation();
          handlers.connect(span);
        },
      }));
      parts.push(svgEl("circle", {
        cx: x,
        cy,
        r: on ? 5.5 : 4,
        style: `fill:${on ? "var(--accent)" : "var(--paper)"};stroke:${on ? "var(--accent)" : "var(--line)"};stroke-width:1.6;pointer-events:none`,
      }));
    }
  };
  layout.forest.forEach(walk);
  if (editing) {
    layout.props.forEach((prop, index) => {
      const row = geom[index];
      if (!row) return;
      const on = isPending(index, index);
      parts.push(svgEl("circle", {
        class: "hit",
        cx: gutW - 6,
        cy: row.mid,
        r: Math.min(15, (row.bottom - row.top) / 2),
        style: "fill:transparent;cursor:pointer",
        onClick: (event) => {
          event.stopPropagation();
          handlers.connect({ start: index, end: index });
        },
      }));
      parts.push(svgEl("circle", {
        cx: gutW - 6,
        cy: row.mid,
        r: on ? 5.5 : 3.5,
        style: `fill:${on ? "var(--accent)" : "var(--unset)"};pointer-events:none`,
      }));
    });
  }
  svg.replaceChildren(...parts);
}
