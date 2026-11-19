import { armsOf, layoutTree } from "./brackets.js";
import { studyCopyright } from "./esv.js";
import { categoryOf, getRelationship, dominantLabel, labelsOf, mainSideOf } from "./relationships.js";

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

const LIGHT = {
  surface: "#ffffff",
  row: "#e9edf1",
  rule: "#d2d7dd",
  line: "#2b3038",
  ink: "#1d222a",
  gold: "#8a7326",
  faint: "#8e97a2",
  coord: "#4e7a35",
  rest: "#3d718f",
  dist: "#b0413a",
  contr: "#c07a1e",
  unset: "#a3aab3",
};

function catHex(category) {
  const key = categoryOf(category)?.key;
  return (key && LIGHT[key]) || LIGHT.unset;
}

function exportNotice(study) {
  if (study?.translation === "ESV") return studyCopyright(study);
  const name = study?.translationName || "Pasted";
  return `${name} text, entered on this device. It was not fetched from the ESV API.`;
}

export function renderSvg(study) {
  const layout = layoutTree(study?.nodes || []);
  const colW = 46;
  const gutterPad = 16;
  const gutW = layout.maxCol * colW + gutterPad;
  const labelW = 56;
  const textW = 560;
  const pad = 26;
  const rowH = 40;
  const header = 64;
  const textX = pad + gutW + labelW;
  const width = textX + textW + pad;
  const noticeLines = wrap(exportNotice(study), 100).slice(0, 6);
  const height = header + Math.max(1, layout.props.length) * rowH + 28 + noticeLines.length * 14;
  const mids = layout.props.map((_, index) => header + index * rowH + rowH / 2);
  const headY = (node) => {
    if (!node) return header;
    if (node.type === "p") return mids[node.i];
    const { first, last } = armsOf(node);
    const top = headY(first);
    const bottom = headY(last);
    const side = mainSideOf(node.group);
    if (side === "mid") return (top + bottom) / 2;
    return side === "top" ? top : bottom;
  };
  const nodeX = (node) => (node.type === "p" ? pad + gutW : pad + gutW - node.col * colW);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="100%" height="100%" fill="${LIGHT.surface}"/>`,
    `<text x="${pad}" y="32" font-family="Georgia, 'Palatino Linotype', serif" font-size="22" fill="${LIGHT.ink}">${escapeXml(study.title)}</text>`,
    `<text x="${pad}" y="52" font-family="Georgia, 'Palatino Linotype', serif" font-size="14" fill="${LIGHT.faint}">${escapeXml([study.reference, study.translationName].filter(Boolean).join(" · "))}</text>`,
  ];
  if (!layout.props.length) {
    parts.push(`<text x="${textX}" y="${header + 24}" font-family="Georgia, serif" font-size="16" fill="${LIGHT.faint}">No propositions yet.</text>`);
  }
  layout.props.forEach((prop, index) => {
    const top = header + index * rowH;
    parts.push(`<rect x="${textX}" y="${top + 2}" width="${textW}" height="${rowH - 2}" fill="${LIGHT.row}" stroke="${LIGHT.rule}"/>`);
    parts.push(`<text x="${pad + gutW + 8}" y="${mids[index] + 5}" font-family="ui-sans-serif, sans-serif" font-size="13" font-weight="600" fill="${LIGHT.gold}">${escapeXml(layout.labels[index] || "")}</text>`);
    parts.push(`<text x="${textX + 12}" y="${mids[index] + 5}" font-family="Georgia, 'Palatino Linotype', serif" font-size="16" fill="${LIGHT.ink}">${escapeXml(prop.text)}</text>`);
  });
  const paint = (node) => {
    if (node.type !== "b") return;
    node.children.forEach(paint);
    const { first, last, drawn } = armsOf(node);
    const x = nodeX(node);
    const yTop = headY(first);
    const yBot = headY(last);
    const rel = getRelationship(node.group.relation);
    const ink = rel ? LIGHT.line : LIGHT.unset;
    const labelColor = rel ? catHex(rel.category) : LIGHT.unset;
    parts.push(`<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBot}" stroke="${ink}" stroke-width="2.2" stroke-linecap="square"/>`);
    for (const child of drawn) {
      const y = headY(child);
      parts.push(`<line x1="${x}" y1="${y}" x2="${nodeX(child)}" y2="${y}" stroke="${ink}" stroke-width="2.2" stroke-linecap="square"/>`);
    }
    const labels = labelsOf(node.group);
    const put = (text, y) => {
      if (!text) return;
      parts.push(`<text x="${x + 9}" y="${y - 6}" font-family="ui-sans-serif, sans-serif" font-size="13" font-weight="600" fill="${labelColor}">${escapeXml(text)}</text>`);
    };
    if (labels.center) put(labels.center, (yTop + yBot) / 2 + 12);
    else {
      put(labels.top, yTop);
      put(labels.bottom, yBot);
    }
    if (!rel) put("?", (yTop + yBot) / 2 + 12);
  };
  layout.forest.forEach(paint);
  let foot = header + Math.max(1, layout.props.length) * rowH + 22;
  for (const line of noticeLines) {
    parts.push(`<text x="${pad}" y="${foot}" font-family="ui-sans-serif, sans-serif" font-size="10" fill="${LIGHT.faint}">${escapeXml(line)}</text>`);
    foot += 14;
  }
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
