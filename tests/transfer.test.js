import assert from "node:assert/strict";
import test from "node:test";
import { renderSvg, toOutline } from "../js/diagram.js";
import { createStudy } from "../js/model.js";
import { loadSettings, loadStudies, memoryStorage, saveSettings, saveStudies, SETTINGS_KEY, STUDIES_KEY } from "../js/storage.js";
import { sampleStudy } from "../js/sample.js";
import { exportLibraryFile, exportStudyFile, planImport, readTransfer } from "../js/transfer.js";

test("settings keep the API key out of the study file", () => {
  const storage = memoryStorage();
  saveSettings({ esvApiKey: "local-key-value", theme: "dark", activeStudyId: "s1" }, storage);
  saveStudies([sampleStudy()], storage);
  const settings = loadSettings(storage);
  assert.equal(settings.esvApiKey, "local-key-value");
  assert.equal(settings.theme, "dark");
  const rawStudies = storage.getItem(STUDIES_KEY);
  assert.equal(rawStudies.includes("local-key-value"), false);
  assert.equal(storage.getItem(SETTINGS_KEY).includes("local-key-value"), true);
  assert.equal(loadStudies(storage)[0].title, "John 3:16 (sample)");
});

test("corrupt storage does not throw", () => {
  const storage = memoryStorage();
  storage.setItem(STUDIES_KEY, "{");
  storage.setItem(SETTINGS_KEY, "{");
  assert.deepEqual(loadStudies(storage), []);
  assert.equal(loadSettings(storage).esvApiKey, "");
});

test("export and import round-trip notes, brackets, and phrasing", () => {
  const study = sampleStudy();
  study.apiKey = "should-not-travel";
  const file = exportStudyFile(study);
  assert.equal(file.format, "textlab-study");
  assert.equal(JSON.stringify(file).includes("should-not-travel"), false);
  const [imported] = readTransfer(JSON.parse(JSON.stringify(file)));
  assert.equal(imported.nodes[0].relation, "action-result");
  assert.equal(imported.nodes[0].children[0].note.length > 0, true);
  assert.equal(imported.phrasing.lines[3].indent, 2);
  assert.throws(() => readTransfer({ format: "other" }), /not a TextLab export/);
});

test("import copies a duplicate id and stops at the 500-verse ESV limit", () => {
  const verses = Array.from({ length: 400 }, (_, index) => `Sample 1:${index + 1}`);
  const big = createStudy({
    title: "Long",
    translation: "ESV",
    reference: "Sample 1",
    sourceText: "Alpha bravo",
    esvVerseRefs: verses,
    nodes: [{ type: "prop", id: "a", text: "Alpha bravo", verse: "1", verseRef: verses[0], note: "" }],
    phrasing: { lines: [{ id: "l", text: "Alpha bravo", indent: 0, note: "" }] },
  });
  const existing = [{ ...big, id: "already" }];
  const incoming = [
    { ...big, id: "already", title: "Copy attempt" },
    { ...big, id: "second", title: "Too many" },
  ];
  const plan = planImport(existing, incoming);
  assert.equal(plan.accepted.length, 0);
  assert.equal(plan.skipped.length, 2);
  assert.match(plan.skipped[0].reason, /500/);

  const small = createStudy({
    title: "Short",
    translation: "paste",
    nodes: [{ type: "prop", id: "p", text: "Hello there", verse: null, verseRef: null, note: "n" }],
  });
  const library = exportLibraryFile([small]);
  const [again] = readTransfer(library);
  assert.equal(again.note, "");
  assert.equal(again.nodes[0].note, "n");
});

test("outline and SVG include the relationship and escape markup", () => {
  const study = sampleStudy();
  study.nodes[0].children[0].text = "God <loved> & gave";
  const outline = toOutline(study);
  assert.match(outline, /Action-Result \(main above\)/);
  assert.match(outline, /Negative-Positive \(main below\)/);
  const svg = renderSvg(study);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /Ac\/Res/);
  assert.match(svg, /God &lt;loved&gt; &amp; gave/);
  assert.equal(svg.includes("<loved>"), false);
});
