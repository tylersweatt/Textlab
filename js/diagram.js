import { studyCopyright } from "./esv.js";
import { getRelationship, dominantLabel } from "./relationships.js";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, max) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roleOf(parent, index) {
  if (!parent || parent.dominant === "equal") return "equal";
  return parent.dominant === index ? "main" : "support";
}

export function toOutline(study) {
  const lines = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      const pad = "  ".repeat(depth);
      if (node.type === "prop") {
        lines.push(`${pad}${node.verse ? `${node.verse}  ` : ""}${node.text}`);
        if (node.note) lines.push(`${pad}  note: ${node.note}`);
      } else {
        const name = getRelationship(node.relation)?.name || "Unset relationship";
        lines.push(`${pad}${name} (${dominantLabel(node.dominant, node.children.length)})`);
        if (node.note) lines.push(`${pad}  note: ${node.note}`);
        walk(node.children, depth + 1);
      }
    }
  };
  const heading = [study.title, [study.reference, study.translationName].filter(Boolean).join(" · ")].filter(Boolean);
  walk(study.nodes || [], 0);
  if (study.note) lines.push("", `Passage note: ${study.note}`);
  return [...heading, "", ...lines].join("\n");
}

export function renderSvg(study) {
  const props = [];
  const brackets = [];
  const walk = (nodes, depth, parent) => {
    nodes.forEach((node, index) => {
      if (node.type === "prop") {
        props.push({ text: node.text, verse: node.verse, note: node.note, depth, role: roleOf(parent, index) });
      } else {
        const start = props.length;
        walk(node.children, depth + 1, node);
        brackets.push({
          start,
          end: props.length - 1,
          depth,
          relation: node.relation,
          dominant: node.dominant,
          childCount: node.children.length,
        });
      }
    });
  };
  walk(study.nodes || [], 0, null);

  const visual = [];
  const spans = props.map(() => ({ start: 0, end: 0 }));
  props.forEach((prop, index) => {
    const wrapped = wrap(prop.verse ? `${prop.verse}  ${prop.text}` : prop.text, 46);
    spans[index].start = visual.length;
    for (const line of wrapped) visual.push({ text: line, role: prop.role, depth: prop.depth, note: false });
    if (prop.note) visual.push({ text: prop.note, role: prop.role, depth: prop.depth, note: true });
    spans[index].end = visual.length - 1;
  });

  const rowH = 26;
  const pad = 20;
  const textX = 28;
  const maxChars = Math.max(28, ...visual.map((row) => row.text.length), 0);
  const textW = Math.min(620, Math.round(maxChars * 7.6));
  const gutter = 92;
  const maxDepth = brackets.reduce((max, bracket) => Math.max(max, bracket.depth), 0);
  const width = pad + textX + textW + (maxDepth + 1) * gutter + pad;
  const header = 68;
  const notice = studyCopyright(study);
  const noticeLines = notice ? wrap(notice, 96).slice(0, 5) : [];
  const footer = 28 + noticeLines.length * 14;
  const height = header + Math.max(1, visual.length) * rowH + footer + 16;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="100%" height="100%" fill="#f4efe6"/>`,
    `<text x="${pad}" y="32" font-family="Georgia, 'Palatino Linotype', serif" font-size="22" fill="#1e1a16">${escapeXml(study.title)}</text>`,
    `<text x="${pad}" y="52" font-family="Georgia, 'Palatino Linotype', serif" font-size="14" fill="#5c5348">${escapeXml([study.reference, study.translationName].filter(Boolean).join(" · "))}</text>`,
  ];
  if (!visual.length) {
    parts.push(`<text x="${textX}" y="${header + 20}" font-family="Georgia, serif" font-size="15" fill="#5c5348">No propositions yet.</text>`);
  }
  visual.forEach((row, index) => {
    const y = header + index * rowH + 18;
    parts.push(
      `<text x="${textX + row.depth * 14}" y="${y}" font-family="Georgia, 'Palatino Linotype', serif" font-size="${row.note ? 12 : 16}" font-weight="${row.role === "main" ? 700 : 400}" font-style="${row.note ? "italic" : "normal"}" fill="${row.note ? "#5c5348" : "#1e1a16"}">${escapeXml(row.text)}</text>`,
    );
  });
  for (const bracket of brackets) {
    if (bracket.end < bracket.start || !spans[bracket.start]) continue;
    const y1 = header + spans[bracket.start].start * rowH + 4;
    const y2 = header + spans[bracket.end].end * rowH + rowH - 6;
    const x = textX + textW + (maxDepth - bracket.depth) * gutter;
    parts.push(`<path d="M ${x} ${y1} H ${x + 12} V ${y2} H ${x}" fill="none" stroke="#8d3b32" stroke-width="1.7"/>`);
    const label = getRelationship(bracket.relation)?.abbr || "Set";
    const mid = (y1 + y2) / 2;
    parts.push(`<text x="${x + 18}" y="${mid - 1}" font-family="ui-sans-serif, sans-serif" font-size="12" fill="#8d3b32">${escapeXml(label)}</text>`);
    parts.push(`<text x="${x + 18}" y="${mid + 13}" font-family="ui-sans-serif, sans-serif" font-size="10" fill="#5c5348">${escapeXml(dominantLabel(bracket.dominant, bracket.childCount))}</text>`);
  }
  let foot = header + Math.max(1, visual.length) * rowH + 20;
  for (const line of noticeLines) {
    parts.push(`<text x="${pad}" y="${foot}" font-family="ui-sans-serif, sans-serif" font-size="10" fill="#5c5348">${escapeXml(line)}</text>`);
    foot += 14;
  }
  parts.push(`<text x="${pad}" y="${height - 14}" font-family="ui-sans-serif, sans-serif" font-size="10" fill="#8a8175">TextLab</text>`);
  parts.push("</svg>");
  return parts.join("");
}

export function renderPhrasingSvg(study) {
  const lines = study.phrasing?.lines || [];
  const visual = [];
  for (const line of lines) {
    for (const [index, wrapped] of wrap(line.text, 52).entries()) {
      visual.push({ text: wrapped, indent: line.indent || 0, note: false, first: index === 0 });
    }
    if (line.note) visual.push({ text: line.note, indent: line.indent || 0, note: true });
  }
  const rowH = 26;
  const pad = 20;
  const width = 760;
  const notice = studyCopyright(study);
  const noticeLines = notice ? wrap(notice, 96).slice(0, 5) : [];
  const height = 68 + Math.max(1, visual.length) * rowH + 36 + noticeLines.length * 14;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="100%" height="100%" fill="#f4efe6"/>`,
    `<text x="${pad}" y="32" font-family="Georgia, serif" font-size="22" fill="#1e1a16">${escapeXml(study.title)}</text>`,
    `<text x="${pad}" y="52" font-family="Georgia, serif" font-size="14" fill="#5c5348">${escapeXml([study.reference, study.translationName, "Phrasing"].filter(Boolean).join(" · "))}</text>`,
  ];
  visual.forEach((row, index) => {
    const y = 78 + index * rowH;
    const x = pad + (row.indent || 0) * 22;
    parts.push(
      `<text x="${x}" y="${y}" font-family="Georgia, serif" font-size="${row.note ? 12 : 16}" font-style="${row.note ? "italic" : "normal"}" fill="${row.note ? "#5c5348" : "#1e1a16"}">${escapeXml(row.text)}</text>`,
    );
  });
  let foot = 78 + Math.max(1, visual.length) * rowH + 8;
  for (const line of noticeLines) {
    parts.push(`<text x="${pad}" y="${foot}" font-family="ui-sans-serif, sans-serif" font-size="10" fill="#5c5348">${escapeXml(line)}</text>`);
    foot += 14;
  }
  parts.push("</svg>");
  return parts.join("");
}
