import assert from "node:assert/strict";
import test from "node:test";
import {
  describeDiagram,
  drawBracket,
  flatten,
  flipBracket,
  labelPropositions,
  rejoinProposition,
  setBracketRelation,
  splitProposition,
  toggleMainSide,
} from "../js/brackets.js";
import { canUndo, commit, createHistory, undo } from "../js/history.js";
import { createStudy, propTexts } from "../js/model.js";
import { matchRelationships } from "../js/relationships.js";
import { validateStudy } from "../js/transfer.js";

function passage(texts, verse = "2") {
  return createStudy({
    title: "Span",
    translation: "paste",
    translationName: "Notes",
    sourceText: texts.join(" "),
    nodes: texts.map((text, index) => ({
      type: "prop",
      id: `p${index}`,
      text,
      verse,
      verseRef: null,
      note: "",
    })),
  });
}

function spans(study) {
  return flatten(study).brackets
    .map((bracket) => [bracket.start, bracket.end, bracket.relation])
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

test("splitting a verse letters it, and rejoining restores the line", () => {
  const study = passage(["Alpha bravo charlie"]);
  const split = splitProposition(study, 0, 1);
  assert.deepEqual(propTexts(split), ["Alpha", "bravo charlie"]);
  assert.deepEqual(labelPropositions(flatten(split).props).labels, ["2a", "2b"]);
  const again = splitProposition(split, 1, 1);
  assert.deepEqual(propTexts(again), ["Alpha", "bravo", "charlie"]);
  assert.deepEqual(labelPropositions(flatten(again).props).labels, ["2a", "2b", "2c"]);
  const rejoined = rejoinProposition(again, 2);
  assert.deepEqual(propTexts(rejoined), ["Alpha", "bravo charlie"]);
  assert.throws(() => splitProposition(study, 0, 0), /later word/);
});

test("a split cannot cross a verse boundary", () => {
  const study = createStudy({
    title: "Verses",
    translation: "paste",
    translationName: "Notes",
    sourceText: "Alpha bravo charlie Delta echo",
    nodes: [
      { type: "prop", id: "a", text: "Alpha bravo charlie", verse: "1", verseRef: "John 1:1", note: "" },
      { type: "prop", id: "b", text: "Delta echo", verse: "2", verseRef: "John 1:2", note: "" },
    ],
  });
  assert.throws(() => rejoinProposition(study, 1), /verse boundary/);
  const split = splitProposition(study, 0, 2);
  assert.deepEqual(labelPropositions(flatten(split).props).labels, ["1a", "1b", "2"]);
  const rejoined = rejoinProposition(split, 1);
  assert.deepEqual(propTexts(rejoined), ["Alpha bravo charlie", "Delta echo"]);
  assert.throws(() => rejoinProposition(rejoined, 1), /verse boundary/);
});

test("drawing a bracket and hanging one off a bracket dot", () => {
  let study = passage(["Alpha", "Beta", "Gamma", "Delta"]);
  study = drawBracket(study, 2, 3).study;
  study = drawBracket(study, 1, 3).study;
  const outer = drawBracket(study, 0, 3);
  assert.equal(outer.notice, "");
  study = outer.study;
  assert.deepEqual(spans(study), [
    [0, 3, null],
    [1, 3, null],
    [2, 3, null],
  ]);
  assert.throws(() => drawBracket(study, 2, 3), /already exists/);
});

test("auto-stretch nests a crossing bracket and undo puts it back", () => {
  let study = passage(["2c here", "2d here", "2e here"]);
  study = drawBracket(study, 0, 1).study;
  const stretched = drawBracket(study, 1, 2);
  assert.match(stretched.notice, /Stretched the unlabelled bracket out to 2a–2c/);
  assert.deepEqual(spans(stretched.study).map((row) => [row[0], row[1]]), [
    [0, 2],
    [1, 2],
  ]);
  let history = createHistory(study);
  history = commit(history, stretched.study);
  assert.equal(canUndo(history), true);
  history = undo(history);
  assert.deepEqual(spans(history.present).map((row) => [row[0], row[1]]), [[0, 1]]);
});

test("a stretch that would stack two brackets on one span is refused", () => {
  let study = passage(["Alpha", "Beta", "Gamma"]);
  study = drawBracket(study, 0, 2).study;
  study = drawBracket(study, 1, 2).study;
  assert.throws(() => drawBracket(study, 0, 1), /duplicate/);
});

test("flip swaps the arms and main side moves only the head line", () => {
  let study = passage(["He served", "by teaching"]);
  study = drawBracket(study, 0, 1).study;
  const id = flatten(study).brackets[0].id;
  study = setBracketRelation(study, id, "action-manner");
  let diagram = describeDiagram(study);
  assert.deepEqual(diagram.brackets[0].labels, { top: "Ac", bottom: "Mn", center: null });
  assert.equal(diagram.brackets[0].side, "top");
  study = flipBracket(study, id);
  diagram = describeDiagram(study);
  assert.deepEqual(diagram.brackets[0].labels, { top: "Mn", bottom: "Ac", center: null });
  assert.equal(diagram.brackets[0].side, "bottom");
  study = toggleMainSide(study, id);
  diagram = describeDiagram(study);
  assert.equal(diagram.brackets[0].side, "top");
  assert.deepEqual(diagram.brackets[0].labels, { top: "Mn", bottom: "Ac", center: null });
});

test("bilateral draws three arms and a series of three draws two", () => {
  let study = passage(["Before", "The support", "After"]);
  study = drawBracket(study, 0, 2).study;
  const id = flatten(study).brackets[0].id;
  study = setBracketRelation(study, id, "bilateral");
  let diagram = describeDiagram(study);
  assert.equal(diagram.brackets[0].armCount, 3);
  assert.equal(diagram.brackets[0].labels.center, "BL");
  study = setBracketRelation(study, id, "series");
  diagram = describeDiagram(study);
  assert.equal(diagram.brackets[0].armCount, 2);
  assert.equal(diagram.brackets[0].labels.center, "S");
});

test("the relationship search finds conjunctions and marks extended relationships", () => {
  assert.equal(matchRelationships("so that")[0].id, "action-result");
  assert.equal(matchRelationships("because")[0].id, "ground");
  assert.equal(matchRelationships("lest")[0].id, "action-purpose");
  assert.equal(matchRelationships("both")[0].id, "both-and");
  assert.equal(matchRelationships("both")[0].extended, true);
  for (const id of ["both-and", "general-specific", "fact-interpretation", "anticipation-fulfillment"]) {
    assert.equal(matchRelationships(id)[0].extended, true);
  }
});

test("an old nested study loads with its saved main side", () => {
  const old = {
    formatVersion: 1,
    id: "old-study",
    title: "Old bracket",
    reference: "John 1:1-2",
    translation: "paste",
    translationName: "Notes",
    sourceText: "In the beginning was the Word. The Word was God.",
    nodes: [
      {
        type: "group",
        id: "g1",
        relation: "action-result",
        dominant: 0,
        note: "kept",
        children: [
          { type: "prop", id: "a", text: "In the beginning was the Word.", verse: "1", verseRef: "John 1:1", note: "first" },
          {
            type: "group",
            id: "g2",
            relation: "ground",
            dominant: 0,
            note: "",
            children: [
              { type: "prop", id: "b", text: "The Word was God.", verse: "2", verseRef: "John 1:2", note: "" },
              { type: "prop", id: "c", text: "All things were made.", verse: "3", verseRef: "John 1:3", note: "" },
            ],
          },
        ],
      },
    ],
  };
  const study = validateStudy(old);
  assert.equal(study.nodes[0].relation, "action-result");
  assert.equal(study.nodes[0].dominant, 0);
  assert.equal(study.nodes[0].flip, false);
  assert.equal(study.nodes[0].note, "kept");
  assert.equal(study.nodes[0].children[0].note, "first");
  const diagram = describeDiagram(study);
  assert.equal(diagram.brackets.find((bracket) => bracket.id === "g1").side, "top");
  assert.deepEqual(diagram.labels, ["1", "2", "3"]);
  assert.deepEqual(propTexts(study), [
    "In the beginning was the Word.",
    "The Word was God.",
    "All things were made.",
  ]);
});
