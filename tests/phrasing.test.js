import assert from "node:assert/strict";
import test from "node:test";
import { createStudy } from "../js/model.js";
import { charIndexOfWord } from "../js/words.js";
import { MAX_INDENT, mergeLineWithNext, rebuildPhrasing, setIndent, splitLine } from "../js/phrasing.js";

function study() {
  return createStudy({
    title: "Phrase",
    translation: "paste",
    translationName: "Notes",
    nodes: [
      { type: "prop", id: "a", text: "For God so loved the world", verse: null, verseRef: null, note: "" },
      { type: "prop", id: "b", text: "that he gave his Son", verse: null, verseRef: null, note: "" },
    ],
    phrasing: {
      lines: [
        { id: "l1", text: "For God so loved the world", indent: 0, note: "" },
        { id: "l2", text: "that he gave his Son", indent: 0, note: "a purpose line" },
      ],
    },
  });
}

test("indent clamps and never adds arrows", () => {
  let next = setIndent(study(), 1, 3);
  assert.equal(next.phrasing.lines[1].indent, 3);
  next = setIndent(next, 1, 40);
  assert.equal(next.phrasing.lines[1].indent, MAX_INDENT);
  next = setIndent(next, 1, -4);
  assert.equal(next.phrasing.lines[1].indent, 0);
  assert.equal(JSON.stringify(next).includes("arrow"), false);
});

test("splitting a phrasing line keeps the words and the note on the first piece", () => {
  const current = study();
  const at = charIndexOfWord(current.phrasing.lines[0].text, 2);
  const next = splitLine(current, 0, at);
  assert.deepEqual(
    next.phrasing.lines.map((line) => line.text),
    ["For God", "so loved the world", "that he gave his Son"],
  );
  assert.equal(next.phrasing.lines[2].note, "a purpose line");
  const merged = mergeLineWithNext(next, 0);
  assert.equal(merged.phrasing.lines[0].text, "For God so loved the world");
});

test("rebuilding phrasing follows the propositions", () => {
  const current = study();
  current.phrasing.lines[1].indent = 4;
  const next = rebuildPhrasing(current);
  assert.equal(next.phrasing.lines.length, 2);
  assert.equal(next.phrasing.lines[1].indent, 0);
  assert.equal(next.phrasing.lines[1].text, "that he gave his Son");
});

test("ESV phrasing cannot gain or lose words", () => {
  const esv = createStudy({
    title: "ESV",
    translation: "ESV",
    reference: "Sample 1:1",
    sourceText: "Alpha bravo charlie",
    esvVerseRefs: ["Sample 1:1"],
    nodes: [{ type: "prop", id: "a", text: "Alpha bravo charlie", verse: "1", verseRef: "Sample 1:1", note: "" }],
    phrasing: { lines: [{ id: "l", text: "Alpha bravo charlie", indent: 0, note: "" }] },
  });
  assert.throws(() => splitLine({ ...esv, phrasing: { lines: [{ ...esv.phrasing.lines[0], text: "Alpha brav" }] } }, 0, 6), /word/);
});
