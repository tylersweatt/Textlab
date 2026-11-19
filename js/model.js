import { dominantFromDefault, getRelationship } from "./relationships.js";
import { scriptureWords } from "./words.js";

export class ModelError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ModelError";
  }
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function walkNodes(nodes, fn) {
  nodes.forEach((node) => {
    fn(node);
    if (node.type === "group") walkNodes(node.children, fn);
  });
}

export function walkProps(nodes, fn) {
  nodes.forEach((node) => {
    if (node.type === "prop") fn(node);
    else walkProps(node.children || [], fn);
  });
}

export function propTexts(study) {
  const texts = [];
  walkProps(study.nodes, (prop) => texts.push(prop.text));
  return texts;
}

export function esvVerseCount(study) {
  if (!study || study.translation !== "ESV") return 0;
  if (Array.isArray(study.esvVerseRefs) && study.esvVerseRefs.length) {
    return new Set(study.esvVerseRefs).size;
  }
  const refs = [];
  walkProps(study.nodes, (prop) => {
    if (prop.verseRef) refs.push(prop.verseRef);
  });
  return new Set(refs).size;
}

export function libraryVerseCount(studies) {
  return studies.reduce((sum, study) => sum + esvVerseCount(study), 0);
}

export const ESV_VERSE_LIMIT = 500;

export function assertEsvIntact(study) {
  if (study.translation !== "ESV" || !study.sourceText) return study;
  const expected = scriptureWords(study.sourceText);
  const actual = scriptureWords(propTexts(study).join(" "));
  if (expected.join("\n") !== actual.join("\n")) {
    throw new ModelError(
      "word-lock",
      "That change would alter the ESV wording. Split lines, merge lines, and write your own words in notes.",
    );
  }
  if (study.phrasing?.lines?.length) {
    const phrased = scriptureWords(study.phrasing.lines.map((line) => line.text).join(" "));
    if (expected.join("\n") !== phrased.join("\n")) {
      throw new ModelError("word-lock", "Phrasing lines have to keep the ESV wording.");
    }
  }
  return study;
}

export function createStudy(input) {
  const now = new Date().toISOString();
  const study = {
    id: input.id || uid(),
    formatVersion: 1,
    title: (input.title || input.reference || "Untitled study").trim() || "Untitled study",
    reference: (input.reference || "").trim(),
    translation: input.translation === "ESV" ? "ESV" : "paste",
    translationName:
      input.translation === "ESV" ? "ESV" : (input.translationName || "Pasted").trim() || "Pasted",
    copyrightNotice: input.copyrightNotice || null,
    sourceText: input.sourceText || "",
    esvVerseRefs: Array.isArray(input.esvVerseRefs) ? input.esvVerseRefs.filter((item) => typeof item === "string") : [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    nodes: input.nodes || [],
    phrasing: input.phrasing || { lines: [] },
    note: input.note || "",
  };
  assertEsvIntact(study);
  return study;
}

export function getNode(study, path) {
  let nodes = study.nodes;
  let node = null;
  for (const index of path) {
    node = nodes[index];
    if (!node) throw new ModelError("range", "That part of the study is no longer there.");
    nodes = node.type === "group" ? node.children : [];
  }
  return node;
}

export function childrenAt(study, parentPath) {
  if (!parentPath.length) return study.nodes;
  const node = getNode(study, parentPath);
  if (node.type !== "group") throw new ModelError("not-group", "Brackets only group adjacent lines.");
  return node.children;
}

function mapAt(nodes, path, fn) {
  const [index, ...rest] = path;
  if (!nodes[index]) throw new ModelError("range", "That part of the study is no longer there.");
  return nodes.map((node, i) => {
    if (i !== index) return node;
    if (!rest.length) return fn(node);
    if (node.type !== "group") throw new ModelError("not-group", "Brackets only group adjacent lines.");
    return { ...node, children: mapAt(node.children, rest, fn) };
  });
}

function withChildren(study, parentPath, producer) {
  if (!parentPath.length) return { ...study, nodes: producer(study.nodes) };
  return {
    ...study,
    nodes: mapAt(study.nodes, parentPath, (node) => {
      if (node.type !== "group") throw new ModelError("not-group", "Brackets only group adjacent lines.");
      return { ...node, children: producer(node.children) };
    }),
  };
}

function updateNode(study, path, fn) {
  return { ...study, nodes: mapAt(study.nodes, path, fn) };
}

function finish(study) {
  assertEsvIntact(study);
  return study;
}

export function bracketSiblings(study, parentPath, start, count) {
  if (!Number.isInteger(start) || !Number.isInteger(count) || count < 2) {
    throw new ModelError("need-two", "Select at least two adjacent lines.");
  }
  return finish(
    withChildren(study, parentPath, (kids) => {
      if (start < 0 || start + count > kids.length) {
        throw new ModelError("range", "Those lines are not one adjacent group.");
      }
      const group = {
        type: "group",
        id: uid(),
        relation: null,
        dominant: "equal",
        note: "",
        children: kids.slice(start, start + count),
      };
      return [...kids.slice(0, start), group, ...kids.slice(start + count)];
    }),
  );
}

export function unbracket(study, path) {
  const node = getNode(study, path);
  if (!node || node.type !== "group") throw new ModelError("not-group", "Select a bracket to remove it.");
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return finish(
    withChildren(study, parentPath, (kids) => [
      ...kids.slice(0, index),
      ...node.children,
      ...kids.slice(index + 1),
    ]),
  );
}

export function setRelation(study, path, relationId) {
  const relation = getRelationship(relationId);
  if (!relation) throw new ModelError("relation", "Choose one of the eighteen relationships.");
  const node = getNode(study, path);
  if (!node || node.type !== "group") throw new ModelError("not-group", "Relationships sit on brackets.");
  const dominant = dominantFromDefault(relation.defaultDominant, node.children.length);
  return updateNode(study, path, (group) => ({ ...group, relation: relation.id, dominant }));
}

export function setDominant(study, path, dominant) {
  const node = getNode(study, path);
  if (!node || node.type !== "group") throw new ModelError("not-group", "Select a bracket first.");
  let value = dominant;
  if (value !== "equal") {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0 || value >= node.children.length) {
      throw new ModelError("dominant", "That main-point choice does not fit this bracket.");
    }
  }
  return updateNode(study, path, (group) => ({ ...group, dominant: value }));
}

export function setNodeNote(study, path, note) {
  return updateNode(study, path, (node) => ({ ...node, note: String(note ?? "") }));
}

export function setStudyNote(study, note) {
  return { ...study, note: String(note ?? "") };
}

export function setTitle(study, title) {
  const next = String(title ?? "").trim();
  return { ...study, title: next || "Untitled study" };
}

export function setPropText(study, path, text) {
  const prop = getNode(study, path);
  if (!prop || prop.type !== "prop") throw new ModelError("not-prop", "Select a proposition to edit.");
  return finish(updateNode(study, path, (node) => ({ ...node, text: String(text ?? "") })));
}

export function splitProp(study, path, charIndex) {
  const prop = getNode(study, path);
  if (!prop || prop.type !== "prop") throw new ModelError("not-prop", "Select a proposition to split.");
  const text = prop.text;
  if (!Number.isInteger(charIndex) || charIndex <= 0 || charIndex >= text.length) {
    throw new ModelError("range", "Choose a word in the middle of the line to split.");
  }
  if (study.translation === "ESV" && !/\s/.test(text[charIndex - 1])) {
    throw new ModelError("word-lock", "ESV lines split between words.");
  }
  const left = text.slice(0, charIndex).trim();
  const right = text.slice(charIndex).trim();
  if (!left || !right) throw new ModelError("range", "A split needs words on both sides.");
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const created = {
    ...prop,
    id: uid(),
    text: right,
    note: "",
  };
  return finish(
    withChildren(study, parentPath, (kids) => [
      ...kids.slice(0, index),
      { ...prop, text: left },
      created,
      ...kids.slice(index + 1),
    ]),
  );
}

export function mergePropWithNext(study, path) {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return finish(
    withChildren(study, parentPath, (kids) => {
      const current = kids[index];
      const next = kids[index + 1];
      if (!current || current.type !== "prop" || !next || next.type !== "prop") {
        throw new ModelError("range", "The next line has to be a proposition, not a bracket. Remove that bracket first.");
      }
      const merged = {
        ...current,
        text: `${current.text.trim()} ${next.text.trim()}`.replace(/\s+/g, " ").trim(),
        note: [current.note, next.note].filter(Boolean).join("\n"),
        verse: current.verse || next.verse,
        verseRef: current.verseRef || next.verseRef,
      };
      return [...kids.slice(0, index), merged, ...kids.slice(index + 2)];
    }),
  );
}

function normalizeGroups(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type !== "group") {
      out.push(node);
      continue;
    }
    const children = normalizeGroups(node.children);
    if (children.length < 2) {
      out.push(...children);
      continue;
    }
    out.push({ ...node, children });
  }
  return out;
}

export function deleteAt(study, path) {
  if (study.translation === "ESV") {
    throw new ModelError(
      "word-lock",
      "ESV lines stay in the passage. Look up a shorter reference, or write the thought in a note.",
    );
  }
  if (!path.length) throw new ModelError("range", "Nothing to delete.");
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const removed = withChildren(study, parentPath, (kids) => kids.filter((_, i) => i !== index));
  return { ...removed, nodes: normalizeGroups(removed.nodes) };
}

export function moveSibling(study, path, direction) {
  if (study.translation === "ESV") {
    throw new ModelError("word-lock", "ESV lines stay in passage order.");
  }
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const target = index + direction;
  return withChildren(study, parentPath, (kids) => {
    if (target < 0 || target >= kids.length) throw new ModelError("range", "That line cannot move any further.");
    const copy = kids.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    return copy;
  });
}

export function insertAfter(study, path, text) {
  if (study.translation === "ESV") {
    throw new ModelError("word-lock", "Pasted studies can add lines. An ESV study keeps the wording Crossway sent.");
  }
  const body = String(text ?? "").trim();
  if (!body) throw new ModelError("range", "Type the new line first.");
  const prop = { type: "prop", id: uid(), text: body, verse: null, verseRef: null, note: "" };
  if (!path.length) return { ...study, nodes: study.nodes.concat(prop) };
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return withChildren(study, parentPath, (kids) => [
    ...kids.slice(0, index + 1),
    prop,
    ...kids.slice(index + 1),
  ]);
}

export function clearBrackets(study) {
  const nodes = [];
  walkProps(study.nodes, (prop) => nodes.push({ ...prop }));
  return { ...study, nodes };
}

export function selectionStillValid(study, selection) {
  if (!selection) return false;
  try {
    const kids = childrenAt(study, selection.parentPath);
    return (
      Number.isInteger(selection.start) &&
      Number.isInteger(selection.end) &&
      selection.start >= 0 &&
      selection.end >= selection.start &&
      selection.end < kids.length
    );
  } catch {
    return false;
  }
}
