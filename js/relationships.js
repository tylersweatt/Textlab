/** Biblearc's 18 logical relationships, in the order the bracketing course teaches them. */

export const CATEGORIES = [
  {
    id: "coordinate",
    label: "Coordinate",
    blurb: "Neither side supports the other. Each one makes its own contribution, so the two sides are equal.",
  },
  {
    id: "restatement",
    label: "Support by restatement",
    blurb: "One side restates, compares, explains, or answers the other.",
  },
  {
    id: "distinct",
    label: "Support by a distinct statement",
    blurb: "One side gives a reason, result, purpose, condition, time, or place for the other.",
  },
  {
    id: "contrary",
    label: "Support by a contrary statement",
    blurb: "One side stands even though the other cuts against it, or the response is not the one you would expect.",
  },
];

export const RELATIONSHIPS = [
  {
    id: "series",
    name: "Series",
    abbr: "S",
    category: "coordinate",
    defaultDominant: "equal",
    hints: "and, moreover, likewise",
    definition: "Each proposition makes its own contribution to a whole.",
  },
  {
    id: "progression",
    name: "Progression",
    abbr: "P",
    category: "coordinate",
    defaultDominant: "equal",
    hints: "then, and (a step further)",
    definition: "Like series, but each proposition is a further step toward a climax.",
  },
  {
    id: "alternative",
    name: "Alternative",
    abbr: "A",
    category: "coordinate",
    defaultDominant: "equal",
    hints: "or, but, on the other hand",
    definition: "Each proposition is a different possibility arising from the situation.",
  },
  {
    id: "action-manner",
    name: "Action-Manner",
    abbr: "Ac/Mn",
    category: "restatement",
    defaultDominant: "first",
    hints: "by, with, in that (also means)",
    definition: "One proposition tells how, or by what means, the action is carried out. The action is usually the main point.",
  },
  {
    id: "comparison",
    name: "Comparison",
    abbr: "Cf",
    category: "restatement",
    defaultDominant: "first",
    hints: "as, just as, like, so also",
    definition: "One proposition clarifies the other by showing what it is like.",
  },
  {
    id: "negative-positive",
    name: "Negative-Positive",
    abbr: "−/+",
    category: "restatement",
    defaultDominant: "last",
    hints: "not…but",
    definition: "One proposition is denied so the other is strengthened. The positive is usually the main point.",
  },
  {
    id: "idea-explanation",
    name: "Idea-Explanation",
    abbr: "Id/Exp",
    category: "restatement",
    defaultDominant: "first",
    hints: "that is, which means",
    definition: "One proposition restates, defines, or unpacks the other.",
  },
  {
    id: "question-answer",
    name: "Question-Answer",
    abbr: "Q/A",
    category: "restatement",
    defaultDominant: "last",
    hints: "question, then answer",
    definition: "A question and the answer to that question. The answer is usually the main point.",
  },
  {
    id: "ground",
    name: "Ground",
    abbr: "G",
    category: "distinct",
    defaultDominant: "first",
    hints: "for, because, since",
    definition: "A statement, then the reason or basis for it. The statement is usually the main point.",
  },
  {
    id: "inference",
    name: "Inference",
    abbr: "∴",
    category: "distinct",
    defaultDominant: "last",
    hints: "therefore, so, thus",
    definition: "A statement, then a conclusion drawn from it. This is the mirror of Ground.",
  },
  {
    id: "bilateral",
    name: "Bilateral",
    abbr: "BL",
    category: "distinct",
    defaultDominant: "equal",
    hints: "for (the middle supports both sides)",
    definition: "A proposition supports both what comes before it and what comes after it.",
  },
  {
    id: "action-result",
    name: "Action-Result",
    abbr: "Ac/Res",
    category: "distinct",
    defaultDominant: "first",
    hints: "so that, with the result that",
    definition: "An action and the result that accompanies it. This is the cause-and-effect relationship.",
  },
  {
    id: "action-purpose",
    name: "Action-Purpose",
    abbr: "Ac/Pur",
    category: "distinct",
    defaultDominant: "first",
    hints: "in order that, so that",
    definition: "An action and the purpose it is intended to accomplish.",
  },
  {
    id: "conditional",
    name: "Conditional",
    abbr: "If/Th",
    category: "distinct",
    defaultDominant: "last",
    hints: "if, unless, provided that",
    definition: "Like Action-Result, except the action is only potential and the result depends on it.",
  },
  {
    id: "temporal",
    name: "Temporal",
    abbr: "T",
    category: "distinct",
    defaultDominant: "last",
    hints: "when, after, while, until",
    definition: "A statement and the time when it is true or can happen.",
  },
  {
    id: "locative",
    name: "Locative",
    abbr: "L",
    category: "distinct",
    defaultDominant: "last",
    hints: "where, wherever",
    definition: "A statement and the place where it is true or can happen.",
  },
  {
    id: "concessive",
    name: "Concessive",
    abbr: "Csv",
    category: "contrary",
    defaultDominant: "last",
    hints: "although, though, yet, even though",
    definition: "The main point stands despite a contrary statement.",
  },
  {
    id: "situation-response",
    name: "Situation-Response",
    abbr: "Sit/R",
    category: "contrary",
    defaultDominant: "last",
    hints: "and (an unexpected response)",
    definition: "A situation and a surprising or counter-intuitive response.",
  },
];

export function getRelationship(id) {
  return RELATIONSHIPS.find((item) => item.id === id) || null;
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
