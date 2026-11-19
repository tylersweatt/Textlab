import { assertEsvIntact, uid } from "./model.js";

export const MAX_INDENT = 8;

export function linesFromNodes(nodes) {
  const lines = [];
  const walk = (list) => {
    for (const node of list) {
      if (node.type === "prop") {
        lines.push({ id: uid(), text: node.text, indent: 0, note: "" });
      } else if (node.type === "group") {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return lines;
}

export function linesFromTexts(texts) {
  return texts.map((text) => ({ id: uid(), text, indent: 0, note: "" }));
}

function withLines(study, producer) {
  const lines = producer(study.phrasing?.lines || []);
  return assertEsvIntact({ ...study, phrasing: { lines } });
}

export function rebuildPhrasing(study) {
  return { ...study, phrasing: { lines: linesFromNodes(study.nodes) } };
}

export function setIndent(study, index, indent) {
  const next = Math.max(0, Math.min(MAX_INDENT, Number(indent) || 0));
  return withLines(study, (lines) => lines.map((line, i) => (i === index ? { ...line, indent: next } : line)));
}

export function setLineNote(study, index, note) {
  return {
    ...study,
    phrasing: {
      lines: (study.phrasing?.lines || []).map((line, i) => (i === index ? { ...line, note: String(note ?? "") } : line)),
    },
  };
}

export function setLineText(study, index, text) {
  return withLines(study, (lines) => lines.map((line, i) => (i === index ? { ...line, text: String(text ?? "") } : line)));
}

export function splitLine(study, index, charIndex) {
  return withLines(study, (lines) => {
    const line = lines[index];
    if (!line) throw new Error("That phrasing line is no longer there.");
    if (!Number.isInteger(charIndex) || charIndex <= 0 || charIndex >= line.text.length) {
      throw new Error("Choose a word in the middle of the line to split.");
    }
    if (study.translation === "ESV" && !/\s/.test(line.text[charIndex - 1])) {
      throw new Error("ESV lines split between words.");
    }
    const left = line.text.slice(0, charIndex).trim();
    const right = line.text.slice(charIndex).trim();
    if (!left || !right) throw new Error("A split needs words on both sides.");
    const created = { id: uid(), text: right, indent: line.indent, note: "" };
    return [...lines.slice(0, index), { ...line, text: left }, created, ...lines.slice(index + 1)];
  });
}

export function mergeLineWithNext(study, index) {
  return withLines(study, (lines) => {
    const current = lines[index];
    const next = lines[index + 1];
    if (!current || !next) throw new Error("There is no following line to merge.");
    const merged = {
      ...current,
      text: `${current.text.trim()} ${next.text.trim()}`.replace(/\s+/g, " ").trim(),
      note: [current.note, next.note].filter(Boolean).join("\n"),
    };
    return [...lines.slice(0, index), merged, ...lines.slice(index + 2)];
  });
}

export function deleteLine(study, index) {
  if (study.translation === "ESV") {
    throw new Error("ESV phrasing keeps every word. Merge lines instead of deleting them.");
  }
  return {
    ...study,
    phrasing: { lines: (study.phrasing?.lines || []).filter((_, i) => i !== index) },
  };
}

export function insertLineAfter(study, index, text) {
  if (study.translation === "ESV") {
    throw new Error("Pasted studies can add phrasing lines. An ESV study keeps the wording Crossway sent.");
  }
  const body = String(text ?? "").trim();
  if (!body) throw new Error("Type the new line first.");
  const lines = (study.phrasing?.lines || []).slice();
  const at = index < 0 ? lines.length : index + 1;
  lines.splice(at, 0, { id: uid(), text: body, indent: 0, note: "" });
  return { ...study, phrasing: { lines } };
}

export function moveLine(study, index, direction) {
  if (study.translation === "ESV") throw new Error("ESV lines stay in passage order. Indent them instead of reordering.");
  const lines = (study.phrasing?.lines || []).slice();
  const target = index + direction;
  if (target < 0 || target >= lines.length) throw new Error("That line cannot move any further.");
  const [item] = lines.splice(index, 1);
  lines.splice(target, 0, item);
  return { ...study, phrasing: { lines } };
}

