/** Biblearc's 18 logical relationships, plus the four optional extended ones.
 *  labels: [top, bottom] printed on the arms. A null arm prints nothing.
 *  center: one label, centred, for coordinate relationships and Bilateral.
 *  main: which arm carries the head line out to the parent ('top' | 'bottom' | 'mid').
 *  tri: Bilateral draws a third arm into the middle of the span.
 */

export const CATEGORIES = [
  {
    id: "coordinate",
    key: "coord",
    label: "Coordinate",
    blurb: "Neither proposition supports the other.",
  },
  {
    id: "restatement",
    key: "rest",
    label: "Support by restatement",
    blurb: "The support says the same thing another way.",
  },
  {
    id: "distinct",
    key: "dist",
    label: "Support by distinct statement",
    blurb: "The support adds something new.",
  },
  {
    id: "contrary",
    key: "contr",
    label: "Support by contrary statement",
    blurb: "The support runs against the main clause.",
  },
];

const CORE = [
  { id: "series", name: "Series", cat: "coordinate", center: "S", main: "mid",
    def: "Each proposition makes its own independent contribution to a whole.",
    conj: "and, moreover, likewise, neither, nor" },
  { id: "progression", name: "Progression", cat: "coordinate", center: "P", main: "mid",
    def: "Like series, but each proposition is a further step toward a climax.",
    conj: "then, and, moreover, furthermore" },
  { id: "alternative", name: "Alternative", cat: "coordinate", center: "A", main: "mid",
    def: "Each proposition expresses a different possibility arising from a situation.",
    conj: "or, but, while, on the other hand" },
  { id: "action-manner", name: "Action-Manner", cat: "restatement", labels: ["Ac", "Mn"], main: "top",
    def: "An action and a statement indicating the way or means by which it is carried out.",
    conj: "in that, by, participles" },
  { id: "comparison", name: "Comparison", cat: "restatement", labels: ["Cf", null], main: "bottom",
    def: "An action and a statement that clarifies it by showing what it is like.",
    conj: "even as, as…so, like, just as" },
  { id: "negative-positive", name: "Negative-Positive", cat: "restatement", labels: ["−", "+"], main: "bottom",
    def: "Two statements, one denied so that the other is enforced. Also the relationship implicit in contrast.",
    conj: "not…but" },
  { id: "idea-explanation", name: "Idea-Explanation", cat: "restatement", labels: ["Id", "Exp"], main: "top",
    def: "An original statement and one clarifying its meaning — a word of it, or the whole.",
    conj: "that is, in other words" },
  { id: "question-answer", name: "Question-Answer", cat: "restatement", labels: ["Q", "A"], main: "bottom",
    def: "The statement of a question and the answer to that question.",
    conj: "question mark" },
  { id: "ground", name: "Ground", cat: "distinct", labels: [null, "G"], main: "top",
    def: "A statement and the argument or reason for it — the support follows.",
    conj: "for, because, since" },
  { id: "inference", name: "Inference", cat: "distinct", labels: [null, "∴"], main: "bottom",
    def: "A statement and the argument or reason for it — the support precedes.",
    conj: "therefore, accordingly, so" },
  { id: "bilateral", name: "Bilateral", cat: "distinct", center: "BL", main: "top", tri: true,
    def: "A proposition that supports two others, one preceding and one following.",
    conj: "for, because, therefore, so" },
  { id: "action-result", name: "Action-Result", cat: "distinct", labels: ["Ac", "Res"], main: "bottom",
    def: "An action and a consequence or result which accompanies it.",
    conj: "so that, that, with the result that" },
  { id: "action-purpose", name: "Action-Purpose", cat: "distinct", labels: ["Ac", "Pur"], main: "bottom",
    def: "An action and its intended result.",
    conj: "in order that, so that, that, lest" },
  { id: "conditional", name: "Conditional", cat: "distinct", labels: ["If", "Th"], main: "bottom",
    def: "Like action-result, except the action is only potential and the result contingent on it.",
    conj: "if…then, provided that, except, unless" },
  { id: "temporal", name: "Temporal", cat: "distinct", labels: ["T", null], main: "bottom",
    def: "A statement and the occasion when it is true or can occur.",
    conj: "when, whenever, after, before" },
  { id: "locative", name: "Locative", cat: "distinct", labels: ["L", null], main: "bottom",
    def: "A statement and the place where it is true or can occur.",
    conj: "where, wherever" },
  { id: "concessive", name: "Concessive", cat: "contrary", labels: ["Csv", null], main: "bottom",
    def: "A main clause that stands despite a contrary statement.",
    conj: "although, though, yet, nevertheless, but, however" },
  { id: "situation-response", name: "Situation-Response", cat: "contrary", labels: ["Sit", "R"], main: "bottom",
    def: "A situation and its surprising or counter-intuitive response.",
    conj: "and" },
];

const EXTENDED = [
  { id: "both-and", name: "Both-And", cat: "coordinate", center: "B/A", main: "mid", extended: true,
    def: "Two propositions emphasized to be both true or both false.",
    conj: "both…and, neither…nor" },
  { id: "general-specific", name: "General-Specific", cat: "restatement", labels: ["Gen", "Spec"], main: "top", extended: true,
    def: "A proposition stating a whole and a second stating one or more of its parts.",
    conj: "namely, such as" },
  { id: "fact-interpretation", name: "Fact-Interpretation", cat: "restatement", labels: ["F", "I"], main: "top", extended: true,
    def: "A statement and its interpretation.",
    conj: "this means, which is" },
  { id: "anticipation-fulfillment", name: "Anticipation-Fulfillment", cat: "distinct", labels: ["Ant", "Ful"], main: "bottom", extended: true,
    def: "A promise along with its accompanying fulfillment.",
    conj: "then, so that" },
];

function publish(raw) {
  const labels = raw.labels || null;
  const abbr = raw.center || (labels || []).filter(Boolean).join("/");
  return {
    id: raw.id,
    name: raw.name,
    abbr,
    category: raw.cat,
    labels,
    center: raw.center || null,
    main: raw.main,
    tri: !!raw.tri,
    extended: !!raw.extended,
    defaultDominant: raw.main === "top" ? "first" : raw.main === "bottom" ? "last" : "equal",
    hints: raw.conj,
    definition: raw.def,
  };
}

export const RELATIONSHIPS = [...CORE, ...EXTENDED].map(publish);

export const CORE_RELATIONSHIPS = RELATIONSHIPS.filter((item) => !item.extended);

export function getRelationship(id) {
  return RELATIONSHIPS.find((item) => item.id === id) || null;
}

export function categoryOf(id) {
  return CATEGORIES.find((item) => item.id === id) || null;
}

export function dominantFromDefault(defaultDominant, childCount) {
  if (defaultDominant === "first") return 0;
  if (defaultDominant === "last") return Math.max(0, childCount - 1);
  return "equal";
}

export function dominantLabel(dominant, childCount) {
  if (dominant === "equal" || childCount < 2) return "equal";
  if (dominant === 0) return "main above";
  if (dominant === childCount - 1) return "main below";
  return `main ${Number(dominant) + 1}`;
}

/** Which arm carries the head line. An unlabeled bracket keeps the head on top. */
export function mainSideOf(group) {
  if (!group) return "top";
  if (group.main === "top" || group.main === "bottom" || group.main === "mid") return group.main;
  const count = group.children?.length || 0;
  const dominant = group.dominant;
  if (dominant === 0) return "top";
  if (count >= 2 && dominant === count - 1) return "bottom";
  if (dominant === "equal") return "mid";
  const rel = getRelationship(group.relation);
  if (!rel) return "top";
  if (rel.main === "mid") return "mid";
  if (group.flip) return rel.main === "top" ? "bottom" : "top";
  return rel.main;
}

export function labelsOf(group) {
  const rel = getRelationship(group?.relation);
  if (!rel) return { top: null, bottom: null, center: null };
  if (rel.center) return { top: null, bottom: null, center: rel.center };
  const [top, bottom] = rel.labels || [null, null];
  return group.flip ? { top: bottom, bottom: top, center: null } : { top, bottom, center: null };
}

const norm = (value) => String(value || "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

function relName(rel) {
  return norm([rel.name, rel.id, rel.center || "", ...(rel.labels || []).filter(Boolean), rel.abbr].join(" "));
}

function relHaystack(rel) {
  const category = categoryOf(rel.category);
  return norm([relName(rel), rel.definition, rel.hints, category?.label || ""].join(" "));
}

/** Search name, abbreviation, definition, category, and conjunctions. Name outranks conjunctions. */
export function matchRelationships(query) {
  const q = norm(query);
  if (!q) return RELATIONSHIPS.slice();
  const phrase = RELATIONSHIPS.filter((rel) => relHaystack(rel).includes(q));
  const terms = q.split(" ");
  const hits = phrase.length
    ? phrase
    : RELATIONSHIPS.filter((rel) => {
        const hay = relHaystack(rel);
        return terms.every((term) => hay.includes(term));
      });
  const score = (rel) => (relName(rel).includes(q) ? 2 : norm(rel.hints).includes(q) ? 1 : 0);
  return hits.slice().sort((a, b) => score(b) - score(a) || RELATIONSHIPS.indexOf(a) - RELATIONSHIPS.indexOf(b));
}

/** Longest phrase first. The family tints the conjunction, not the bracket it sits under. */
export const CONJUNCTIONS = [
  ["with the result that", "dist"],
  ["in order that", "dist"],
  ["on the other hand", "coord"],
  ["nevertheless", "contr"],
  ["accordingly", "dist"],
  ["furthermore", "coord"],
  ["provided that", "dist"],
  ["even as", "rest"],
  ["just as", "rest"],
  ["so that", "dist"],
  ["whenever", "dist"],
  ["wherever", "dist"],
  ["although", "contr"],
  ["moreover", "coord"],
  ["likewise", "coord"],
  ["therefore", "dist"],
  ["because", "dist"],
  ["however", "contr"],
  ["neither", "coord"],
  ["that is", "rest"],
  ["unless", "dist"],
  ["except", "dist"],
  ["before", "dist"],
  ["though", "contr"],
  ["while", "coord"],
  ["since", "dist"],
  ["after", "dist"],
  ["where", "dist"],
  ["when", "dist"],
  ["like", "rest"],
  ["then", "dist"],
  ["thus", "dist"],
  ["nor", "coord"],
  ["for", "dist"],
  ["but", "contr"],
  ["and", "coord"],
  ["yet", "contr"],
  ["that", "rest"],
  ["if", "dist"],
  ["so", "dist"],
  ["or", "coord"],
];

export function tokensOf(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/** Leading conjunction on a proposition, if conjunction tinting is on. */
export function leadingConjunction(tokens) {
  const lower = tokens.map((token) => token.toLowerCase().replace(/^[“"‘'(—-]+/, "").replace(/[,.;:!?…”"’')]+$/, ""));
  for (const [phrase, cat] of CONJUNCTIONS) {
    const words = phrase.split(" ");
    if (words.length > tokens.length) continue;
    if (words.every((word, index) => lower[index] === word)) return { count: words.length, cat };
  }
  return null;
}
