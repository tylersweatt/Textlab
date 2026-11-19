import { linesFromNodes } from "./phrasing.js";
import { getRelationship } from "./relationships.js";
import {
  ESV_VERSE_LIMIT,
  assertEsvIntact,
  createStudy,
  esvVerseCount,
  libraryVerseCount,
  uid,
} from "./model.js";

function clip(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function validateNodes(nodes) {
  if (!Array.isArray(nodes)) throw new Error("A study in this file is missing its propositions.");
  return nodes.map(validateNode);
}

function validateNode(node) {
  if (!node || typeof node !== "object") throw new Error("A line in this file is unreadable.");
  if (node.type === "prop") {
    if (typeof node.text !== "string") throw new Error("A proposition in this file is missing its text.");
    return {
      type: "prop",
      id: typeof node.id === "string" && node.id ? node.id : uid(),
      text: node.text,
      verse: typeof node.verse === "string" ? node.verse : null,
      verseRef: typeof node.verseRef === "string" ? node.verseRef : null,
      note: typeof node.note === "string" ? node.note : "",
    };
  }
  if (node.type === "group") {
    const children = validateNodes(node.children);
    if (children.length < 2) throw new Error("A bracket in this file does not connect two lines.");
    const relation = node.relation == null || node.relation === "" ? null : node.relation;
    if (relation && !getRelationship(relation)) {
      throw new Error("A bracket uses a relationship this version of TextLab does not know.");
    }
    let dominant = node.dominant === "equal" ? "equal" : Number(node.dominant);
    if (dominant !== "equal" && (!Number.isInteger(dominant) || dominant < 0 || dominant >= children.length)) {
      dominant = "equal";
    }
    const main = node.main === "top" || node.main === "bottom" || node.main === "mid" ? node.main : null;
    return {
      type: "group",
      id: typeof node.id === "string" && node.id ? node.id : uid(),
      relation,
      dominant,
      flip: node.flip === true,
      main,
      note: typeof node.note === "string" ? node.note : "",
      children,
    };
  }
  throw new Error("A line in this file is unreadable.");
}

function validatePhrasing(input) {
  const raw = input && Array.isArray(input.lines) ? input.lines : [];
  if (!raw.length) return { lines: [] };
  return {
    lines: raw.map((line) => ({
      id: line && typeof line.id === "string" && line.id ? line.id : uid(),
      text: line && typeof line.text === "string" ? line.text : "",
      indent: Math.max(0, Math.min(8, Number(line?.indent) || 0)),
      note: line && typeof line.note === "string" ? line.note : "",
    })),
  };
}

export function validateStudy(input) {
  if (!input || typeof input !== "object") throw new Error("A study in this file is unreadable.");
  if (input.formatVersion != null && input.formatVersion !== 1) {
    throw new Error("This study was made by a newer TextLab. Update the app, then import it again.");
  }
  if (input.translation !== "ESV" && input.translation !== "paste") {
    throw new Error("A study is missing its translation.");
  }
  const nodes = validateNodes(input.nodes);
  let phrasing = validatePhrasing(input.phrasing);
  if (!phrasing.lines.length) phrasing = { lines: linesFromNodes(nodes) };
  let sourceText = typeof input.sourceText === "string" ? input.sourceText : "";
  if (input.translation === "ESV" && !sourceText) {
    const texts = [];
    const walk = (list) => {
      for (const node of list) {
        if (node.type === "prop") texts.push(node.text);
        else walk(node.children);
      }
    };
    walk(nodes);
    sourceText = texts.join(" ");
  }
  const study = createStudy({
    id: typeof input.id === "string" && input.id ? input.id : uid(),
    title: clip(input.title, 200) || "Imported study",
    reference: clip(input.reference, 160),
    translation: input.translation,
    translationName: clip(input.translationName, 40),
    copyrightNotice: typeof input.copyrightNotice === "string" ? input.copyrightNotice : null,
    sourceText,
    esvVerseRefs: Array.isArray(input.esvVerseRefs) ? input.esvVerseRefs.filter((item) => typeof item === "string") : [],
    createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
    nodes,
    phrasing,
    note: typeof input.note === "string" ? input.note : "",
  });
  assertEsvIntact(study);
  return study;
}

function publicStudy(study) {
  const copy = structuredClone(study);
  delete copy.apiKey;
  delete copy.esvApiKey;
  return copy;
}

export function exportStudyFile(study) {
  return {
    format: "textlab-study",
    version: 1,
    exportedAt: new Date().toISOString(),
    study: publicStudy(study),
  };
}

export function exportLibraryFile(studies) {
  return {
    format: "textlab-library",
    version: 1,
    exportedAt: new Date().toISOString(),
    studies: studies.map(publicStudy),
  };
}

export function readTransfer(data) {
  if (!data || typeof data !== "object") throw new Error("This file is not a TextLab export.");
  if (data.format === "textlab-library" && data.version === 1 && Array.isArray(data.studies)) {
    return data.studies.map(validateStudy);
  }
  if (data.format === "textlab-study" && data.version === 1 && data.study) {
    return [validateStudy(data.study)];
  }
  throw new Error("This file is not a TextLab export.");
}

export function planImport(existing, incoming) {
  const accepted = [];
  const skipped = [];
  let used = libraryVerseCount(existing);
  const ids = new Set(existing.map((study) => study.id));
  for (const study of incoming) {
    let next = study;
    if (ids.has(next.id)) next = { ...next, id: uid() };
    const count = esvVerseCount(next);
    if (used + count > ESV_VERSE_LIMIT) {
      skipped.push({
        title: next.title,
        reason: "Adding it would store more than 500 ESV verses on this device.",
      });
      continue;
    }
    accepted.push(next);
    ids.add(next.id);
    used += count;
  }
  return { accepted, skipped };
}
