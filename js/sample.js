import { bracketSiblings, createStudy, setNodeNote, setRelation, uid } from "./model.js";
import { linesFromTexts } from "./phrasing.js";

const CLAUSES = [
  "For God so loved the world",
  "that he gave his only begotten Son",
  "that whosoever believeth in him should not perish",
  "but have everlasting life.",
];

/** Public-domain KJV, so the first screen is usable before an ESV key is added. */
export function sampleStudy() {
  let study = createStudy({
    title: "John 3:16 (sample)",
    reference: "John 3:16",
    translation: "paste",
    translationName: "KJV",
    sourceText:
      "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    nodes: CLAUSES.map((text) => ({
      type: "prop",
      id: uid(),
      text,
      verse: "16",
      verseRef: null,
      note: "",
    })),
    note: "A public-domain KJV sample, so you can practice before adding an ESV key.",
  });
  study = bracketSiblings(study, [], 2, 2);
  study = setRelation(study, [2], "negative-positive");
  study = bracketSiblings(study, [], 1, 2);
  study = setRelation(study, [1], "action-purpose");
  study = bracketSiblings(study, [], 0, 2);
  study = setRelation(study, [0], "action-result");
  study = setNodeNote(study, [0, 0], "The main clause. The giving tells what that love did.");
  const lines = linesFromTexts(CLAUSES);
  lines[1].indent = 1;
  lines[2].indent = 2;
  lines[3].indent = 2;
  lines[0].note = "Main line. Indent the lines that support it. Phrasing has no arrows.";
  return { ...study, phrasing: { lines } };
}
