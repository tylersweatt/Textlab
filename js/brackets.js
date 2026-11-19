import { ModelError, assertEsvIntact, uid } from "./model.js";
import { charIndexOfWord } from "./words.js";
import {
  getRelationship,
  labelsOf,
  leadingConjunction,
  mainSideOf,
  tokensOf,
} from "./relationships.js";

function verseKey(prop) {
  if (prop?.verseRef) return `ref:${prop.verseRef}`;
  if (prop?.verse) return `v:${prop.verse}`;
  return null;
}

function chapterOf(prop) {
  const ref = String(prop?.verseRef || "");
  const match = ref.match(/(\d+)\s*:\s*\d+\s*$/);
  return match ? match[1] : null;
}

function baseLabel(prop, multi, index) {
  if (prop?.verse) return multi && chapterOf(prop) ? `${chapterOf(prop)}:${prop.verse}` : String(prop.verse);
  return String(index + 1);
}

/** Verse-letter labels: one proposition in a verse is `16`, a split verse is `16a`, `16b`. */
export function labelPropositions(props) {
  const chapters = new Set(props.map(chapterOf).filter(Boolean));
  const multi = chapters.size > 1;
  const labels = [];
  const firstOfVerse = [];
  let i = 0;
  while (i < props.length) {
    const key = verseKey(props[i]);
    let j = i + 1;
    if (key) {
      while (j < props.length && verseKey(props[j]) === key) j += 1;
    }
    const count = j - i;
    const base = baseLabel(props[i], multi, i);
    for (let k = 0; k < count; k += 1) {
      labels.push(count > 1 && key ? base + String.fromCharCode(97 + k) : base);
      firstOfVerse.push(k === 0);
    }
    i = j;
  }
  return { labels, firstOfVerse };
}

export function sameVerse(a, b) {
  const left = verseKey(a);
  const right = verseKey(b);
  if (!left && !right) return true;
  return left != null && left === right;
}

export function flatten(study) {
  const props = [];
  const brackets = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node?.type === "prop") {
        props.push(node);
        continue;
      }
      if (node?.type !== "group") continue;
      const start = props.length;
      walk(node.children || []);
      const end = props.length - 1;
      brackets.push({
        id: node.id,
        start,
        end,
        relation: node.relation ?? null,
        flip: !!node.flip,
        side: mainSideOf(node),
        note: node.note || "",
      });
    }
  };
  walk(study?.nodes || []);
  return { props, brackets };
}

function sideToDominant(side, count) {
  if (side === "top") return 0;
  if (side === "bottom") return Math.max(0, count - 1);
  return "equal";
}

function nests(a, b) {
  return a.end < b.start || b.end < a.start
    || (a.start <= b.start && b.end <= a.end)
    || (b.start <= a.start && a.end <= b.end);
}

/** Widen existing brackets so a new span nests. Refuse a stretch that would pile two brackets on one span. */
export function planNesting(brackets, start, end) {
  const plan = brackets.map((bracket) => ({ bracket, start: bracket.start, end: bracket.end }));
  const fresh = { start, end };
  let changed = true;
  let guard = 0;
  while (changed && guard < 200) {
    guard += 1;
    changed = false;
    for (const row of plan) {
      for (const other of [fresh, ...plan]) {
        if (row === other || nests(row, other)) continue;
        row.start = Math.min(row.start, other.start);
        row.end = Math.max(row.end, other.end);
        changed = true;
      }
    }
  }
  const seen = new Set([`${start}-${end}`]);
  for (const row of plan) {
    const key = `${row.start}-${row.end}`;
    if (seen.has(key)) return { ok: false, moved: [] };
    seen.add(key);
  }
  return {
    ok: true,
    moved: plan.filter((row) => row.start !== row.bracket.start || row.end !== row.bracket.end),
  };
}

function contained(outer, inner) {
  return outer !== inner && outer.start <= inner.start && inner.end <= outer.end;
}

function treeFromSpans(props, brackets) {
  const fill = (start, end, pool) => {
    const kids = [];
    let index = start;
    const mine = pool
      .filter((bracket) => !pool.some((other) => contained(other, bracket)))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    for (const bracket of mine) {
      while (index < bracket.start) {
        kids.push(props[index]);
        index += 1;
      }
      const children = fill(
        bracket.start,
        bracket.end,
        pool.filter((other) => other !== bracket && bracket.start <= other.start && other.end <= bracket.end),
      );
      if (children.length >= 2) {
        kids.push({
          type: "group",
          id: bracket.id || uid(),
          relation: bracket.relation ?? null,
          dominant: sideToDominant(bracket.side || "top", children.length),
          flip: !!bracket.flip,
          main: null,
          note: bracket.note || "",
          children,
        });
      } else {
        kids.push(...children);
      }
      index = bracket.end + 1;
    }
    while (index <= end) {
      kids.push(props[index]);
      index += 1;
    }
    return kids;
  };
  if (!props.length) return [];
  return fill(0, props.length - 1, brackets.filter((bracket) => bracket.end > bracket.start && bracket.start >= 0 && bracket.end < props.length));
}

function rebuild(study, props, brackets) {
  return assertEsvIntact({ ...study, nodes: treeFromSpans(props, brackets) });
}

function spanText(props, row) {
  const { labels } = labelPropositions(props);
  const left = labels[row.start] || String(row.start + 1);
  const right = labels[row.end] || String(row.end + 1);
  return `${left}–${right}`;
}

export function drawBracket(study, start, end) {
  const { props, brackets } = flatten(study);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    throw new ModelError("need-two", "A bracket needs at least two propositions.");
  }
  if (start < 0 || end >= props.length) throw new ModelError("range", "That bracket does not land on the passage.");
  if (brackets.some((bracket) => bracket.start === start && bracket.end === end)) {
    throw new ModelError("duplicate", "That bracket already exists.");
  }
  const plan = planNesting(brackets, start, end);
  if (!plan.ok) {
    throw new ModelError("cross", "That crosses another bracket, and stretching to fit would duplicate one.");
  }
  const moved = plan.moved.map((row) => {
    const name = getRelationship(row.bracket.relation)?.name || "unlabelled";
    row.bracket.start = row.start;
    row.bracket.end = row.end;
    return `${name} bracket out to ${spanText(props, row)}`;
  });
  brackets.push({
    id: uid(),
    start,
    end,
    relation: null,
    flip: false,
    side: "top",
    note: "",
  });
  const notice = moved.length
    ? `Stretched the ${moved.join(", and the ")} so the new bracket nests inside.`
    : "";
  return { study: rebuild(study, props, brackets), notice };
}

function shiftForSplit(brackets, index) {
  return brackets.map((bracket) => ({
    ...bracket,
    start: bracket.start > index ? bracket.start + 1 : bracket.start,
    end: bracket.end >= index ? bracket.end + 1 : bracket.end,
  }));
}

function shiftForMerge(brackets, index) {
  return brackets
    .map((bracket) => ({
      ...bracket,
      start: bracket.start >= index ? bracket.start - 1 : bracket.start,
      end: bracket.end >= index ? bracket.end - 1 : bracket.end,
    }))
    .filter((bracket) => bracket.end > bracket.start);
}

/** Split proposition `index` before word `wordIndex`. A split stays inside its verse. */
export function splitProposition(study, index, wordIndex) {
  const { props, brackets } = flatten(study);
  const prop = props[index];
  if (!prop) throw new ModelError("range", "That proposition is no longer there.");
  if (!Number.isInteger(wordIndex) || wordIndex <= 0) {
    throw new ModelError("range", "Choose a later word to start the new proposition.");
  }
  const charIndex = charIndexOfWord(prop.text, wordIndex);
  if (charIndex <= 0 || charIndex >= prop.text.length) {
    throw new ModelError("range", "Choose a word in the middle of the line to split.");
  }
  if (study.translation === "ESV" && !/\s/.test(prop.text[charIndex - 1])) {
    throw new ModelError("word-lock", "ESV lines split between words.");
  }
  const left = prop.text.slice(0, charIndex).trim();
  const right = prop.text.slice(charIndex).trim();
  if (!left || !right) throw new ModelError("range", "A split needs words on both sides.");
  const created = { ...prop, id: uid(), text: right, note: "" };
  const nextProps = [...props.slice(0, index), { ...prop, text: left }, created, ...props.slice(index + 1)];
  return rebuild(study, nextProps, shiftForSplit(brackets, index));
}

/** Rejoin proposition `index` with the line above. Refuses a join across a verse boundary. */
export function rejoinProposition(study, index) {
  const { props, brackets } = flatten(study);
  const current = props[index];
  const previous = props[index - 1];
  if (!current || !previous) throw new ModelError("range", "There is no line above to rejoin.");
  if (!sameVerse(previous, current)) {
    throw new ModelError("verse", "A proposition cannot cross a verse boundary. Split and rejoin stay inside one verse.");
  }
  const merged = {
    ...previous,
    text: `${previous.text.trim()} ${current.text.trim()}`.replace(/\s+/g, " ").trim(),
    note: [previous.note, current.note].filter(Boolean).join("\n"),
  };
  const nextProps = [...props.slice(0, index - 1), merged, ...props.slice(index + 1)];
  return rebuild(study, nextProps, shiftForMerge(brackets, index));
}

function updateGroup(study, id, fn) {
  let found = false;
  const walk = (nodes) => nodes.map((node) => {
    if (node.type !== "group") return node;
    if (node.id === id) {
      found = true;
      return fn(node);
    }
    return { ...node, children: walk(node.children || []) };
  });
  const nodes = walk(study.nodes || []);
  if (!found) throw new ModelError("range", "That bracket is no longer there.");
  return { ...study, nodes };
}

export function findGroup(study, id) {
  let found = null;
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.type === "group") {
        if (node.id === id) found = node;
        else walk(node.children);
      }
    }
  };
  walk(study?.nodes);
  return found;
}

export function setBracketRelation(study, id, relationId) {
  const relation = relationId ? getRelationship(relationId) : null;
  if (relationId && !relation) throw new ModelError("relation", "Choose a relationship from the list.");
  return updateGroup(study, id, (group) => {
    if (!relation || group.relation === relation.id) {
      return { ...group, relation: null, dominant: 0, main: null };
    }
    const count = group.children.length;
    const dominant = relation.main === "top" ? 0 : relation.main === "bottom" ? count - 1 : "equal";
    const flipped = group.flip && relation.main !== "mid";
    const side = flipped ? (relation.main === "top" ? "bottom" : "top") : relation.main;
    const adjusted = side === "top" ? 0 : side === "bottom" ? count - 1 : "equal";
    return { ...group, relation: relation.id, dominant: relation.main === "mid" ? dominant : adjusted, main: null };
  });
}

/** Swap which half is which. The head line follows the swapped default. */
export function flipBracket(study, id) {
  return updateGroup(study, id, (group) => {
    const flip = !group.flip;
    const rel = getRelationship(group.relation);
    let dominant = group.dominant;
    if (rel && rel.main !== "mid") {
      const side = flip ? (rel.main === "top" ? "bottom" : "top") : rel.main;
      dominant = side === "top" ? 0 : group.children.length - 1;
    }
    return { ...group, flip, dominant, main: null };
  });
}

/** Move the head line to the other arm. Does not swap the labels. */
export function toggleMainSide(study, id) {
  return updateGroup(study, id, (group) => {
    const side = mainSideOf(group);
    const next = side === "top" ? "bottom" : "top";
    const dominant = next === "top" ? 0 : Math.max(0, group.children.length - 1);
    return { ...group, dominant, main: next };
  });
}

export function setBracketNote(study, id, note) {
  return updateGroup(study, id, (group) => ({ ...group, note: String(note ?? "") }));
}

export function deleteBracket(study, id) {
  const { props, brackets } = flatten(study);
  return rebuild(study, props, brackets.filter((bracket) => bracket.id !== id));
}

function convertNode(node, props) {
  if (node.type === "prop") {
    const index = props.length;
    props.push(node);
    return { type: "p", i: index };
  }
  return {
    type: "b",
    group: node,
    children: (node.children || []).map((child) => convertNode(child, props)),
  };
}

export function layoutTree(nodes) {
  const props = [];
  const forest = (nodes || []).map((node) => convertNode(node, props));
  const maxCol = assignCols(forest);
  return { props, forest, maxCol, ...labelPropositions(props) };
}

export function assignCols(nodes) {
  let max = 0;
  const walk = (node) => {
    if (node.type === "p") return 0;
    const height = 1 + Math.max(0, ...node.children.map(walk));
    node.col = height;
    max = Math.max(max, height);
    return height;
  };
  nodes.forEach(walk);
  return max;
}

/** Arms: first child, last child, every nested bracket, and Bilateral's middle arm. */
export function armsOf(node) {
  const kids = node.children || [];
  const first = kids[0];
  const last = kids[kids.length - 1];
  const drawn = new Set([first, last].filter(Boolean));
  for (const child of kids) {
    if (child.type === "b") drawn.add(child);
  }
  const rel = getRelationship(node.group?.relation);
  if (rel?.tri && kids.length >= 3) drawn.add(kids[Math.floor((kids.length - 1) / 2)]);
  return {
    first,
    last,
    drawn: [...drawn].sort((a, b) => kids.indexOf(a) - kids.indexOf(b)),
  };
}

export function describeDiagram(study) {
  const layout = layoutTree(study?.nodes || []);
  const brackets = [];
  const walk = (node) => {
    if (node.type !== "b") return;
    node.children.forEach(walk);
    const rel = getRelationship(node.group.relation);
    const labels = labelsOf(node.group);
    brackets.push({
      id: node.group.id,
      relation: node.group.relation,
      side: mainSideOf(node.group),
      flip: !!node.group.flip,
      labels,
      armCount: armsOf(node).drawn.length,
      category: rel?.category || null,
      extended: !!rel?.extended,
      col: node.col,
    });
  };
  layout.forest.forEach(walk);
  return {
    labels: layout.labels,
    brackets,
    conjunctions: layout.props.map((prop) => leadingConjunction(tokensOf(prop.text))),
  };
}

export { labelsOf, mainSideOf };
