import assert from "node:assert/strict";
import test from "node:test";
import { nodesFromVerses, parseBookChapter, parseEsvPassageText, splitClauseText, versesFromPlainText } from "../js/passage.js";
import { scriptureWords } from "../js/words.js";

test("splits John 3:16's clauses and keeps the conjunctions", () => {
  const parts = splitClauseText(
    "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
  );
  assert.deepEqual(parts, [
    "For God so loved the world",
    "that he gave his only begotten Son",
    "that whosoever believeth in him should not perish",
    "but have everlasting life.",
  ]);
});

test("does not split ordinary phrases on and or so", () => {
  assert.deepEqual(splitClauseText("God so loved the world"), ["God so loved the world"]);
  assert.deepEqual(splitClauseText("heaven and earth"), ["heaven and earth"]);
  const parts = splitClauseText("I went to the post office, and I picked her up.");
  assert.deepEqual(parts, ["I went to the post office", "and I picked her up."]);
});

test("parses the documented ESV passage-text example", () => {
  const parsed = parseEsvPassageText("John 11:35\n\n  [35] Jesus wept. (ESV)", "John 11:35");
  assert.equal(parsed.copyrightNotice, "");
  assert.equal(parsed.verses.length, 1);
  assert.equal(parsed.verses[0].verse, "35");
  assert.equal(parsed.verses[0].verseRef, "John 11:35");
  assert.equal(parsed.verses[0].text, "Jesus wept.");
});

test("lifts the copyright notice off the passage and tracks a chapter change", () => {
  const raw = [
    "John 1",
    "",
    "[1] Alpha bravo.",
    "",
    "John 2",
    "",
    "[1] Charlie delta.",
    "",
    "(ESV)",
    "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.",
  ].join("\n");
  const parsed = parseEsvPassageText(raw, "John 1–2");
  assert.match(parsed.copyrightNotice, /Crossway/);
  assert.deepEqual(
    parsed.verses.map((verse) => verse.verseRef),
    ["John 1:1", "John 2:1"],
  );
  assert.deepEqual(
    parsed.verses.map((verse) => verse.text),
    ["Alpha bravo.", "Charlie delta."],
  );
  assert.deepEqual(scriptureWords(parsed.verses.map((verse) => verse.text).join(" ")), [
    "Alpha",
    "bravo",
    "Charlie",
    "delta",
  ]);
});

test("plain paste becomes paragraphs, and verse markers become verses", () => {
  const paragraphs = versesFromPlainText("First paragraph.\n\nSecond paragraph.");
  assert.equal(paragraphs.length, 2);
  const marked = versesFromPlainText("[1] Alpha one. [2] Beta two.");
  assert.equal(marked.length, 2);
  assert.equal(marked[1].verse, "2");
});

test("clause nodes preserve verse labels", () => {
  const nodes = nodesFromVerses(
    [{ verse: "16", verseRef: "John 3:16", text: "He came, and he saw." }],
    { clauseSplit: true },
  );
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].verseRef, "John 3:16");
  assert.equal(nodes[1].text, "and he saw.");
});

test("book and chapter parsing knows numbered books", () => {
  assert.deepEqual(parseBookChapter("1 John 3:16"), { book: "1 John", chapter: 3 });
  assert.deepEqual(parseBookChapter("Song of Solomon 2:1"), { book: "Song of Solomon", chapter: 2 });
  assert.equal(parseBookChapter("not a reference"), null);
});
