import assert from "node:assert/strict";
import test from "node:test";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "../js/history.js";
import {
  bracketSiblings,
  createStudy,
  deleteAt,
  esvVerseCount,
  getNode,
  mergePropWithNext,
  propTexts,
  setDominant,
  setNodeNote,
  setPropText,
  setRelation,
  splitProp,
  unbracket,
} from "../js/model.js";
import { charIndexOfWord } from "../js/words.js";
import { RELATIONSHIPS } from "../js/relationships.js";
import { sampleStudy } from "../js/sample.js";

function flatStudy(texts, extra = {}) {
  return createStudy({
    title: "Flat",
    translation: "paste",
    translationName: "Notes",
    sourceText: texts.join(" "),
    nodes: texts.map((text, index) => ({
      type: "prop",
      id: `p${index}`,
      text,
      verse: null,
      verseRef: null,
      note: "",
    })),
    ...extra,
  });
}

function esvStudy(text = "Alpha bravo charlie delta") {
  return createStudy({
    title: "ESV test",
    reference: "Sample 1:1",
    translation: "ESV",
    sourceText: text,
    esvVerseRefs: ["Sample 1:1"],
    copyrightNotice: "Scripture quotations are from the ESV® Bible.",
    nodes: [
      { type: "prop", id: "a", text, verse: "1", verseRef: "Sample 1:1", note: "" },
    ],
    phrasing: { lines: [{ id: "l", text, indent: 0, note: "" }] },
  });
}

test("eighteen Biblearc relationships are unique and categorized", () => {
  assert.equal(RELATIONSHIPS.length, 18);
  assert.equal(new Set(RELATIONSHIPS.map((item) => item.id)).size, 18);
  assert.equal(new Set(RELATIONSHIPS.map((item) => item.abbr)).size, 18);
  for (const item of RELATIONSHIPS) {
    assert.ok(item.definition.length > 20);
    assert.ok(["coordinate", "restatement", "distinct", "contrary"].includes(item.category));
  }
});

test("brackets nest, label, mark a main point, and mark both equal", () => {
  let study = flatStudy(["God loved", "he gave", "whoever believes"]);
  study = bracketSiblings(study, [], 1, 2);
  study = setRelation(study, [1], "action-purpose");
  assert.equal(getNode(study, [1]).dominant, 0);
  study = setDominant(study, [1], "equal");
  assert.equal(getNode(study, [1]).dominant, "equal");
  study = setDominant(study, [1], 1);
  assert.equal(getNode(study, [1]).dominant, 1);
  study = setNodeNote(study, [1], "Purpose of the giving.");
  study = bracketSiblings(study, [], 0, 2);
  study = setRelation(study, [0], "idea-explanation");
  assert.equal(getNode(study, [0]).children[1].note, "Purpose of the giving.");
  assert.deepEqual(propTexts(study), ["God loved", "he gave", "whoever believes"]);
  study = unbracket(study, [0]);
  assert.equal(study.nodes[1].type, "group");
  assert.equal(study.nodes[0].text, "God loved");
});

test("rejects a short bracket, a bad range, and an unknown relationship", () => {
  const study = flatStudy(["one", "two"]);
  assert.throws(() => bracketSiblings(study, [], 0, 1), /at least two/);
  assert.throws(() => bracketSiblings(study, [], 1, 2), /adjacent/);
  const grouped = bracketSiblings(study, [], 0, 2);
  assert.throws(() => setRelation(grouped, [0], "not-a-real-relation"), /eighteen/);
  assert.throws(() => setDominant(grouped, [0], 4), /main-point/);
  assert.throws(() => unbracket(grouped, [0, 0]), /bracket/);
});

test("split and merge keep every word, including on an ESV study", () => {
  const esv = esvStudy();
  const at = charIndexOfWord(esv.nodes[0].text, 2);
  let split = splitProp(esv, [0], at);
  assert.deepEqual(propTexts(split), ["Alpha bravo", "charlie delta"]);
  split = splitProp(split, [1], charIndexOfWord(split.nodes[1].text, 1));
  assert.deepEqual(propTexts(split), ["Alpha bravo", "charlie", "delta"]);
  const merged = mergePropWithNext(split, [1]);
  assert.deepEqual(propTexts(merged), ["Alpha bravo", "charlie delta"]);
  assert.throws(() => setPropText(esv, [0], "Alpha brave charlie delta"), /ESV wording/);
  assert.throws(() => deleteAt(esv, [0]), /ESV lines stay/);
  assert.equal(esvVerseCount(esv), 1);
  const again = splitProp(esv, [0], at);
  assert.equal(esvVerseCount(again), 1);
});

test("deleting inside a bracket unwraps a group that would have one child", () => {
  let study = flatStudy(["one", "two", "three"]);
  study = bracketSiblings(study, [], 0, 2);
  study = deleteAt(study, [0, 0]);
  assert.equal(study.nodes.length, 2);
  assert.equal(study.nodes[0].type, "prop");
  assert.equal(study.nodes[0].text, "two");
});

test("notes and undo restore the previous bracket", () => {
  let history = createHistory(flatStudy(["one", "two"], { note: "" }));
  history = commit(history, bracketSiblings(history.present, [], 0, 2));
  history = commit(history, setNodeNote(history.present, [0], "A series, still unlabeled."));
  history = commit(history, setRelation(history.present, [0], "series"));
  assert.equal(history.present.nodes[0].relation, "series");
  assert.equal(canUndo(history), true);
  history = undo(history);
  assert.equal(history.present.nodes[0].relation, null);
  assert.equal(history.present.nodes[0].note, "A series, still unlabeled.");
  history = undo(history);
  assert.equal(history.present.nodes[0].note, "");
  history = redo(history);
  assert.equal(canRedo(undo(history)), true);
  assert.equal(history.present.nodes[0].note, "A series, still unlabeled.");
});

test("the sample study is a nested bracket of the public-domain verse", () => {
  const study = sampleStudy();
  assert.equal(study.translation, "paste");
  assert.equal(study.nodes.length, 1);
  assert.equal(study.nodes[0].relation, "action-result");
  assert.equal(study.nodes[0].dominant, 0);
  const purpose = study.nodes[0].children[1];
  assert.equal(purpose.relation, "action-purpose");
  assert.equal(purpose.children[1].relation, "negative-positive");
  assert.equal(purpose.children[1].dominant, 1);
  assert.match(propTexts(study).join(" "), /only begotten Son/);
  assert.equal(study.phrasing.lines[3].indent, 2);
  assert.match(study.phrasing.lines[0].note, /no arrows/i);
});
