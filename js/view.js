import { studyCopyright, STANDARD_ESV_NOTICE } from "./esv.js";
import { ESV_VERSE_LIMIT, getNode, libraryVerseCount } from "./model.js";
import { CATEGORIES, RELATIONSHIPS, dominantLabel, getRelationship } from "./relationships.js";
import { charIndexOfWord } from "./words.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function singlePath(selection) {
  if (!selection || selection.start !== selection.end) return null;
  return selection.parentPath.concat(selection.start);
}

function selectedNode(study, selection) {
  const path = singlePath(selection);
  if (!path) return null;
  try {
    return { path, node: getNode(study, path) };
  } catch {
    return null;
  }
}

function sameTarget(editor, target) {
  if (!editor || editor.kind !== target.kind) return false;
  if (target.kind === "study") return true;
  if (target.kind === "line") return editor.index === target.index;
  return (editor.path || []).join(",") === (target.path || []).join(",");
}

function renderNote(note, editor, target, handlers) {
  if (sameTarget(editor, target)) {
    const area = el("textarea", {
      class: "note-input",
      rows: "3",
      "aria-label": "Note",
      "data-autofocus": "true",
      onInput: (event) => handlers.noteInput(target, event.target.value),
      onBlur: (event) => {
        handlers.noteInput(target, event.target.value);
        handlers.noteBlur();
      },
    });
    area.value = note || "";
    return area;
  }
  if (note) {
    return el("button", { type: "button", class: "note-text", text: note, onClick: () => handlers.openNote(target) });
  }
  return el("button", { type: "button", class: "note-add", text: "Add note", onClick: () => handlers.openNote(target) });
}

function renderWords(text, onWord) {
  const fragment = document.createDocumentFragment();
  const words = String(text).match(/\S+/g) || [];
  words.forEach((word, index) => {
    if (index) fragment.append(document.createTextNode(" "));
    fragment.append(
      el("button", {
        type: "button",
        class: "word",
        text: word,
        title: index === 0 ? "Select this line" : "Start a new line at this word",
        onClick: (event) => {
          event.stopPropagation();
          onWord(index);
        },
      }),
    );
  });
  return fragment;
}

function inRange(selection, parentPath, index) {
  if (!selection) return false;
  if (selection.parentPath.join(",") !== parentPath.join(",")) return false;
  return index >= selection.start && index <= selection.end;
}

function renderNodes(study, nodes, parentPath, parentGroup, handlers, state) {
  return nodes.map((node, index) => {
    const path = parentPath.concat(index);
    const role = !parentGroup || parentGroup.dominant === "equal" ? "equal" : parentGroup.dominant === index ? "main" : "support";
    const selected = inRange(state.selection, parentPath, index);
    if (node.type === "prop") return renderProp(node, path, role, selected, handlers, state);
    return renderGroup(study, node, path, role, selected, handlers, state);
  });
}

function renderProp(node, path, role, selected, handlers, state) {
  const text = el("div", { class: "prop-text" });
  text.append(
    renderWords(node.text, (wordIndex) => {
      if (wordIndex === 0) handlers.selectOnly(path.slice(0, -1), path.at(-1));
      else handlers.splitAt(path, charIndexOfWord(node.text, wordIndex));
    }),
  );
  return el("article", { class: `prop role-${role}${selected ? " in-range" : ""}` }, [
    el("button", {
      type: "button",
      class: `gutter${selected ? " on" : ""}`,
      "aria-label": "Select proposition",
      "aria-pressed": selected ? "true" : "false",
      text: selected ? "●" : "○",
      onClick: (event) => handlers.select(path.slice(0, -1), path.at(-1), event.shiftKey),
    }),
    el("div", { class: "prop-body" }, [
      node.verse ? el("span", { class: "verse", text: node.verse }) : null,
      text,
      renderNote(node.note, state.noteEditor, { kind: "prop", path }, handlers),
    ]),
  ]);
}

function renderGroup(study, node, path, role, selected, handlers, state) {
  const relation = getRelationship(node.relation);
  return el("article", { class: `group role-${role}${selected ? " in-range" : ""}` }, [
    el("div", { class: "group-top" }, [
      el("button", {
        type: "button",
        class: `gutter${selected ? " on" : ""}`,
        "aria-label": "Select bracket",
        "aria-pressed": selected ? "true" : "false",
        text: selected ? "●" : "○",
        onClick: (event) => handlers.select(path.slice(0, -1), path.at(-1), event.shiftKey),
      }),
      el("button", {
        type: "button",
        class: `rel-chip${relation ? "" : " unset"}`,
        onClick: () => handlers.focusGroup(path),
      }, [
        el("span", { class: "abbr", text: relation ? relation.abbr : "Set" }),
        relation ? el("span", { class: "fullname", text: relation.name }) : null,
        el("span", { class: "dom", text: dominantLabel(node.dominant, node.children.length) }),
      ]),
    ]),
    el("div", { class: "group-children" }, renderNodes(study, node.children, path, node, handlers, state)),
    renderNote(node.note, state.noteEditor, { kind: "group", path }, handlers),
  ]);
}

function snippet(node) {
  let current = node;
  while (current?.type === "group") current = current.children[0];
  const text = current?.text || "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function renderInspector(study, handlers, state) {
  const count = state.selection ? state.selection.end - state.selection.start + 1 : 0;
  const chosen = selectedNode(study, state.selection);
  const parts = [el("h2", { text: "Bracket" })];
  if (!state.selection) {
    parts.push(el("p", { text: "Tap the circle beside a line, then tap the next line. Bracket joins adjacent lines or groups." }));
  } else if (count > 1) {
    parts.push(el("p", { text: `${count} adjacent lines selected.` }));
    parts.push(el("button", { type: "button", class: "primary", text: "Bracket selection", onClick: handlers.bracket }));
  } else if (chosen?.node.type === "group") {
    const group = chosen.node;
    const relation = getRelationship(group.relation);
    parts.push(el("p", { class: "hint", text: relation ? relation.definition : "Choose the relationship these lines have." }));
    if (relation) parts.push(el("p", { class: "hint", text: `Test with: ${relation.hints}` }));
    for (const category of CATEGORIES) {
      parts.push(
        el("section", { class: "rel-group" }, [
          el("h3", { text: category.label }),
          ...RELATIONSHIPS.filter((item) => item.category === category.id).map((item) =>
            el("button", {
              type: "button",
              class: `rel-option${group.relation === item.id ? " on" : ""}`,
              onClick: () => handlers.setRelation(chosen.path, item.id),
            }, [el("span", { class: "abbr", text: item.abbr }), el("span", { text: item.name })]),
          ),
        ]),
      );
    }
    parts.push(el("h3", { text: "Main point" }));
    parts.push(
      el("div", { class: "dominant-row" }, [
        el("button", {
          type: "button",
          class: group.dominant === "equal" ? "primary" : "text-btn",
          text: "Both equal",
          onClick: () => handlers.setDominant(chosen.path, "equal"),
        }),
        ...group.children.map((child, index) =>
          el("button", {
            type: "button",
            class: group.dominant === index ? "primary" : "text-btn",
            text: index === 0 ? "Main is first" : index === group.children.length - 1 ? "Main is last" : `Main is ${index + 1}`,
            title: snippet(child),
            onClick: () => handlers.setDominant(chosen.path, index),
          }),
        ),
      ]),
    );
    parts.push(el("button", { type: "button", class: "text-btn", text: "Remove bracket", onClick: handlers.unbracket }));
  } else if (chosen?.node.type === "prop") {
    parts.push(el("p", { text: "Tap any later word in the line to split before that word. Merge joins this line with the next proposition." }));
    parts.push(
      el("div", { class: "action-row" }, [
        el("button", { type: "button", class: "text-btn", text: "Merge with next", onClick: handlers.merge }),
        study.translation === "paste"
          ? el("button", { type: "button", class: "text-btn danger", text: "Delete line", onClick: handlers.deleteSelection })
          : null,
      ]),
    );
    if (study.translation === "paste") {
      const area = el("textarea", {
        id: "prop-editor",
        rows: "4",
        "aria-label": "Proposition text",
        onFocus: () => handlers.beginTextEdit(),
        onInput: (event) => handlers.editProp(chosen.path, event.target.value),
        onBlur: () => handlers.endTextEdit(),
      });
      area.value = chosen.node.text;
      parts.push(el("label", { text: "Edit wording" }, [area]));
    } else {
      parts.push(el("p", { class: "hint", text: "ESV wording stays as Crossway sent it. Put your own words in a note." }));
    }
  }
  if (chosen && chosen.path.length) {
    parts.push(el("button", { type: "button", class: "quiet", text: "Select the bracket around this", onClick: handlers.selectParent }));
  }
  return el("aside", { class: `inspector${state.sheet ? " open" : ""}`, "aria-label": "Bracket tools" }, [
    el("button", { type: "button", class: "quiet mobile-only", text: "Close", onClick: handlers.closeSheet }),
    ...parts,
  ]);
}

function renderPhrasing(study, handlers, state) {
  const lines = study.phrasing?.lines || [];
  const intro = el("p", {
    class: "intro",
    text: "Indent a line under the line it supports. Tap a later word to split a line. Phrasing has no arrows.",
  });
  if (!lines.length) {
    return el("div", { class: "empty" }, [
      el("p", { text: "No phrasing lines yet." }),
      el("button", { type: "button", class: "primary", text: "Build lines from the propositions", onClick: handlers.rebuildPhrasing }),
    ]);
  }
  return el("div", { class: "phrases" }, [intro, ...lines.map((line, index) => {
    const body = el("div", { class: "phrase-body" });
    const text = el("div", { class: "phrase-text", style: `--indent: ${line.indent || 0}` });
    text.append(
      renderWords(line.text, (wordIndex) => {
        if (wordIndex === 0) return;
        handlers.splitLine(index, charIndexOfWord(line.text, wordIndex));
      }),
    );
    body.append(text, renderNote(line.note, state.noteEditor, { kind: "line", index }, handlers));
    return el("article", { class: `phrase-line${line.indent ? " indented" : ""}` }, [
      el("div", { class: "indent-row" }, [
        el("button", {
          type: "button",
          class: "indent-btn",
          "aria-label": "Outdent",
          text: "‹",
          disabled: !line.indent,
          onClick: () => handlers.setIndent(index, (line.indent || 0) - 1),
        }),
        el("button", {
          type: "button",
          class: "indent-btn",
          "aria-label": "Indent",
          text: "›",
          onClick: () => handlers.setIndent(index, (line.indent || 0) + 1),
        }),
      ]),
      body,
      el("button", { type: "button", class: "quiet", text: "Merge", onClick: () => handlers.mergeLine(index) }),
    ]);
  })]);
}

function renderPhrasingInspector(study, handlers, state) {
  return el("aside", { class: `inspector${state.sheet ? " open" : ""}`, "aria-label": "Phrasing tools" }, [
    el("button", { type: "button", class: "quiet mobile-only", text: "Close", onClick: handlers.closeSheet }),
    el("h2", { text: "Phrasing" }),
    el("p", { text: "Break the passage into lines and indent a line under the one it supports. This view has no arrows." }),
    el("p", { text: "Tap a later word to split a line. The controls beside a line move it left or right." }),
    el("button", { type: "button", class: "text-btn", text: "Rebuild lines from propositions", onClick: handlers.rebuildPhrasing }),
    study.translation === "ESV"
      ? el("p", { class: "hint", text: "ESV lines keep their wording and their order. Indent, split, and merge." })
      : null,
  ]);
}

function renderCopyright(study) {
  if (study.translation === "ESV") {
    return el("footer", { class: "copyright" }, [
      el("p", { text: studyCopyright(study) || STANDARD_ESV_NOTICE }),
      el("p", {}, [
        "ESV text from ",
        el("a", { href: "https://www.esv.org/", target: "_blank", rel: "noopener noreferrer", text: "ESV.org" }),
        ". Stored on this device, within Crossway’s 500-verse limit.",
      ]),
    ]);
  }
  return el("footer", { class: "copyright" }, [
    el("p", { text: `${study.translationName || "Pasted"} text, entered on this device. It was not fetched from the ESV API.` }),
  ]);
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
    field("Reference", input({ name: "reference", type: "text", placeholder: "John 3:16", autocomplete: "off", autocapitalize: "off" }, draft.reference || "")),
    el("div", { class: "choice" }, [
      el("label", {}, [input({ type: "radio", name: "mode", value: "esv", checked: mode === "esv" ? true : null }), "Look up the ESV"]),
      el("label", {}, [input({ type: "radio", name: "mode", value: "paste", checked: mode === "paste" ? true : null }), "Paste text"]),
    ]),
    mode === "esv" && !state.settings.esvApiKey
      ? el("p", { class: "hint", text: "Add your ESV API key in Settings first, or paste the passage." })
      : null,
    el("div", { hidden: mode !== "paste" }, [
      field("Passage", passage),
      field("Translation label", input({ name: "translationName", type: "text" }, draft.translationName || "Pasted")),
    ]),
    el("label", { class: "choice" }, [
      input({ type: "checkbox", name: "clauses", value: "yes", checked: draft.clauses === "no" ? null : true }),
      "Divide into clauses",
    ]),
    el("button", { type: "submit", class: "primary", text: state.busy ? "Working…" : mode === "esv" ? "Look up" : "Create study", disabled: state.busy }),
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
        el("button", { type: "button", class: "primary", text: "New study", onClick: () => handlers.openDialog({ type: "new" }) }),
        el("button", { type: "button", class: "text-btn", text: "Import", onClick: handlers.import }),
      ]),
      ...filtered.map((study) =>
        el("div", { class: "study-row" }, [
          el("button", { type: "button", class: "grow", onClick: () => handlers.openStudy(study.id) }, [
            el("strong", { text: study.title }),
            el("br"),
            el("small", { text: [study.reference, study.translationName].filter(Boolean).join(" · ") }),
          ]),
          el("button", { type: "button", class: "quiet", text: "Copy", onClick: () => handlers.duplicate(study.id) }),
          el("button", { type: "button", class: "quiet", text: "Export", onClick: () => handlers.exportStudy(study.id) }),
          el("button", { type: "button", class: "quiet danger", text: "Delete", onClick: () => handlers.deleteStudy(study.id) }),
        ]),
      ),
      filtered.length ? null : el("p", { text: "No studies match that search." }),
    ];
  } else if (dialog.type === "new" || dialog.type === "replace") {
    title = dialog.type === "new" ? "New study" : "Replace passage";
    body = [renderNewStudy(state, handlers)];
  } else if (dialog.type === "settings") {
    title = "Settings";
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
        el("button", { type: "submit", class: "primary", text: "Save settings" }),
      ]),
      el("button", { type: "button", class: "quiet", text: "Forget the key on this device", onClick: handlers.forgetKey }),
      el("p", { class: "hint", text: `${used} of ${ESV_VERSE_LIMIT} ESV verses stored on this device.` }),
      el("h3", { text: "ESV copyright" }),
      el("p", { class: "hint", text: STANDARD_ESV_NOTICE }),
    ];
  } else if (dialog.type === "file") {
    title = "File";
    const item = (text, onClick) => el("button", { type: "button", class: "text-btn", text, onClick });
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
    title = "How to bracket";
    body = [
      el("ol", {}, [
        el("li", { text: "Load a passage with your ESV key, or paste text. Paste works with no key." }),
        el("li", { text: "Tap a later word to split a proposition. Merge joins it with the next one." }),
        el("li", { text: "Tap the circles beside two or more adjacent lines, then tap Bracket." }),
        el("li", { text: "Choose one of the eighteen relationships. Series, Progression, and Alternative are coordinate: mark them equal." }),
        el("li", { text: "For the other relationships, mark which side is the main point, or mark both equal." }),
        el("li", { text: "Bracket groups the same way until one bracket covers the passage. Add a note anywhere." }),
        el("li", { text: "Phrasing is separate: indent lines under the lines they support. There are no arrows." }),
        el("li", { text: "Studies stay on this device. Export a JSON file to move work to another device by AirDrop or iCloud Drive." }),
      ]),
      ...CATEGORIES.map((category) =>
        el("section", {}, [
          el("h3", { text: category.label }),
          el("p", { text: category.blurb }),
          ...RELATIONSHIPS.filter((item) => item.category === category.id).map((item) =>
            el("p", {}, [el("strong", { text: `${item.abbr} ${item.name}. ` }), item.definition, ` Test: ${item.hints}.`]),
          ),
        ]),
      ),
    ];
  } else if (dialog.type === "confirm") {
    title = dialog.title;
    body = [
      el("p", { text: dialog.message }),
      el("div", { class: "action-row" }, [
        el("button", { type: "button", class: "primary danger", text: dialog.confirmLabel || "Confirm", onClick: dialog.onConfirm }),
        el("button", { type: "button", class: "text-btn", text: "Cancel", onClick: handlers.closeDialog }),
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

export function renderApp(state, handlers) {
  const study = state.history.present;
  const count = state.selection ? state.selection.end - state.selection.start + 1 : 0;
  const one = selectedNode(study, state.selection);
  const bracketLabel = count > 1 ? "Bracket" : "Details";
  return el("div", { class: "app" }, [
    state.banner ? el("div", { class: "banner", role: "status" }, [
      state.banner.text,
      el("button", { type: "button", class: "quiet", text: "Dismiss", onClick: handlers.dismissBanner }),
    ]) : null,
    state.offline ? el("div", { class: "banner", text: "Offline. Saved studies still open. ESV lookup needs a connection." }) : null,
    state.storageWarning ? el("div", { class: "banner", text: state.storageWarning }) : null,
    el("header", { class: "topbar" }, [
      el("div", { class: "brand", text: "" }, ["Text", el("span", { text: "Lab" })]),
      state.renaming
        ? input({
            id: "title-input",
            class: "title-input",
            type: "text",
            "aria-label": "Study title",
            onBlur: (event) => handlers.rename(event.target.value),
            onKeydown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); },
          }, study.title)
        : el("button", { type: "button", class: "title-btn", text: study.title, onClick: handlers.startRename }),
      el("p", { class: "reference-line" }, [
        study.reference || "No reference",
        " · ",
        el("span", { class: "badge", text: study.translation === "ESV" ? "ESV" : study.translationName || "Pasted" }),
      ]),
      el("div", { class: "spacer" }),
      el("div", { class: "segment", role: "tablist" }, [
        el("button", { type: "button", class: state.view === "brackets" ? "on" : "", text: "Brackets", onClick: () => handlers.setView("brackets") }),
        el("button", { type: "button", class: state.view === "phrasing" ? "on" : "", text: "Phrasing", onClick: () => handlers.setView("phrasing") }),
      ]),
      el("button", { type: "button", class: "icon-btn", text: state.resolved === "dark" ? "Light" : "Dark", onClick: handlers.toggleTheme }),
      el("button", { type: "button", class: "icon-btn", text: "Studies", onClick: () => handlers.openDialog({ type: "studies" }) }),
      el("button", { type: "button", class: "icon-btn", text: "File", onClick: () => handlers.openDialog({ type: "file" }) }),
      el("button", { type: "button", class: "icon-btn desktop-only", text: "Guide", onClick: () => handlers.openDialog({ type: "guide" }) }),
      el("button", { type: "button", class: "icon-btn", text: "Settings", onClick: () => handlers.openDialog({ type: "settings" }) }),
    ]),
    el("div", { class: "toolbar no-print" }, [
      el("button", { type: "button", class: "primary", text: "Bracket", disabled: count < 2, onClick: handlers.bracket }),
      el("button", { type: "button", class: "text-btn", text: "Unbracket", disabled: one?.node.type !== "group", onClick: handlers.unbracket }),
      el("button", { type: "button", class: "text-btn", text: "Undo", disabled: !state.canUndo, onClick: handlers.undo }),
      el("button", { type: "button", class: "text-btn", text: "Redo", disabled: !state.canRedo, onClick: handlers.redo }),
      el("button", { type: "button", class: "text-btn desktop-only", text: "Guide", onClick: () => handlers.openDialog({ type: "guide" }) }),
    ]),
    el("div", { class: "workspace" }, [
      el("div", { class: "canvas-wrap" }, [
        el("main", { class: "canvas", id: "passage" }, [
          el("div", { class: "print-only" }, [
            el("h1", { text: study.title }),
            el("p", { text: [study.reference, study.translationName].filter(Boolean).join(" · ") }),
          ]),
          study.nodes.length
            ? state.view === "brackets"
              ? el("div", { class: "tree", role: "tree" }, renderNodes(study, study.nodes, [], null, handlers, state))
              : renderPhrasing(study, handlers, state)
            : el("div", { class: "empty" }, [
                el("h2", { text: "Add a passage" }),
                el("p", { text: "Look up an ESV reference, or paste any text. Paste works without an API key." }),
                el("button", { type: "button", class: "primary", text: "New study", onClick: () => handlers.openDialog({ type: "new" }) }),
              ]),
          el("section", { class: "passage-note" }, [
            el("h2", { class: "desktop-only", style: "font-family:var(--serif);font-size:1.1rem", text: "Passage note" }),
            renderNote(study.note, state.noteEditor, { kind: "study" }, handlers),
          ]),
          renderCopyright(study),
        ]),
      ]),
      state.view === "phrasing" ? renderPhrasingInspector(study, handlers, state) : renderInspector(study, handlers, state),
    ]),
    el("div", { class: "mobile-bar" }, [
      el("button", {
        type: "button",
        class: "primary",
        text: bracketLabel,
        onClick: count > 1 ? handlers.bracket : handlers.openSheet,
      }),
      el("button", { type: "button", class: "text-btn", text: "Unbracket", disabled: one?.node.type !== "group", onClick: handlers.unbracket }),
      el("button", { type: "button", class: "text-btn", text: "Undo", disabled: !state.canUndo, onClick: handlers.undo }),
      el("button", { type: "button", class: "text-btn", text: "Guide", onClick: () => handlers.openDialog({ type: "guide" }) }),
    ]),
    state.sheet ? el("button", { type: "button", class: "scrim show", "aria-label": "Close tools", onClick: handlers.closeSheet }) : null,
    renderDialog(state, handlers),
  ]);
}
