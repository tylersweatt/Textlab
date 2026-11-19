import { EsvError } from "./esv-error.js";
import { uid } from "./model.js";

export const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
  "Esther", "Job", "Psalm", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah",
  "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
  "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];

const BOOKS_BY_LENGTH = [...BOOKS].sort((a, b) => b.length - a.length);

export function parseBookChapter(reference) {
  const text = String(reference ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const book of BOOKS_BY_LENGTH) {
    const name = book.toLowerCase();
    if (!lower.startsWith(name)) continue;
    const rest = text.slice(book.length).trim();
    const match = rest.match(/^(\d+)/);
    if (!match) continue;
    return { book, chapter: Number(match[1]) };
  }
  return null;
}

export function matchBookChapter(line) {
  const trimmed = String(line ?? "").trim();
  const parsed = parseBookChapter(trimmed);
  if (!parsed) return null;
  const rest = trimmed.slice(parsed.book.length).trim();
  if (!/^\d+(?::\d+(?:\s*[-–—]\s*\d+)?)?(?:\s*[-–—]\s*\d+(?::\d+)?)?$/.test(rest)) return null;
  return { ...parsed, raw: trimmed };
}

function cleanupChunk(text) {
  return String(text ?? "")
    .replace(/\(ESV\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn one ESV plain-text passage into verses.
 * `canonical` is the API's canonical reference, used for chapter context.
 */
export function parseEsvPassageText(raw, canonical = "") {
  let text = String(raw ?? "").replace(/\r\n/g, "\n");
  let copyrightNotice = "";
  const copyAt = text.search(/\n[ \t]*Scripture quotations are from the ESV/i);
  if (copyAt >= 0) {
    copyrightNotice = text.slice(copyAt).trim();
    text = text.slice(0, copyAt);
  }
  text = text.replace(/\s*\(ESV\)\s*$/i, "");

  const start = parseBookChapter(canonical);
  let book = start?.book || "";
  let chapter = start?.chapter ?? null;

  const parts = text.split(/\[(\d+)\]/);
  const preambleHeading = lastHeading(parts[0] || "");
  if (preambleHeading) {
    book = preambleHeading.book;
    chapter = preambleHeading.chapter;
  }

  const verses = [];
  if (parts.length === 1) {
    const body = plainBody(parts[0] || "");
    if (body) verses.push({ verse: null, verseRef: null, text: body });
    return { copyrightNotice, verses };
  }

  for (let i = 1; i < parts.length; i += 2) {
    const verse = parts[i];
    const lines = String(parts[i + 1] || "").split("\n");
    const kept = [];
    let nextHeading = null;
    for (const line of lines) {
      const heading = matchBookChapter(line);
      if (heading) {
        nextHeading = heading;
        continue;
      }
      kept.push(line);
    }
    const body = cleanupChunk(kept.join(" "));
    if (body) {
      const verseRef = book && chapter ? `${book} ${chapter}:${verse}` : null;
      verses.push({ verse, verseRef, text: body });
    }
    if (nextHeading) {
      book = nextHeading.book;
      chapter = nextHeading.chapter;
    }
  }
  return { copyrightNotice, verses };
}

function lastHeading(preamble) {
  const lines = String(preamble).split("\n").map((line) => line.trim()).filter(Boolean);
  let found = null;
  for (const line of lines) {
    const heading = matchBookChapter(line);
    if (heading) found = heading;
  }
  return found;
}

function plainBody(preamble) {
  const lines = String(preamble)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !matchBookChapter(line));
  return cleanupChunk(lines.join(" "));
}

export function parseEsvResponse(data) {
  if (!data || !Array.isArray(data.passages)) {
    throw new EsvError("bad-response", "The ESV API returned something unexpected.");
  }
  const verses = [];
  const notices = [];
  data.passages.forEach((passage, index) => {
    if (typeof passage !== "string" || !passage.trim() || /^\s*ERROR:/i.test(passage)) return;
    const canonical =
      data.passage_meta?.[index]?.canonical || (data.passages.length === 1 ? data.canonical : "") || data.canonical || "";
    const parsed = parseEsvPassageText(passage, canonical);
    if (parsed.copyrightNotice) notices.push(parsed.copyrightNotice);
    parsed.verses.forEach((verse, verseIndex) => {
      if (!verse.verseRef) {
        verse.verseRef = canonical ? `${canonical}#${verse.verse || verseIndex}` : `verse-${index}-${verseIndex}`;
      }
      verses.push(verse);
    });
  });
  if (!verses.length) {
    throw new EsvError("not-found", "No passage came back for that reference. Check it, for example John 3:16.");
  }
  return {
    canonical: data.canonical || "",
    sourceText: verses.map((verse) => verse.text).join(" "),
    copyrightNotice: notices[0] || "",
    verses,
    esvVerseRefs: [...new Set(verses.map((verse) => verse.verseRef).filter(Boolean))],
  };
}

const COMMA_CONJUNCTIONS =
  "in order that|so that|just as|even as|even though|because|although|though|since|while|whenever|where|when|before|after|until|unless|that|and|but|nor|yet|for|or|if|so|as|like";
const BARE_CONJUNCTIONS = "in order that|so that|because|although|even though|though|if|but";

function clauseSplitter() {
  return new RegExp(
    String.raw`;+\s+|,\s+(?=(?:${COMMA_CONJUNCTIONS})\b)|\s+(?=(?:${BARE_CONJUNCTIONS})\b)`,
    "gi",
  );
}

/** Divide one sentence into clause-sized propositions. Conjunctions stay with the following clause. */
export function splitClauseText(text) {
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const parts = [];
  let start = 0;
  for (const match of source.matchAll(clauseSplitter())) {
    const chunk = source.slice(start, match.index).replace(/[;,]\s*$/, "").trim();
    if (chunk) parts.push(chunk);
    start = match.index + match[0].length;
  }
  const last = source.slice(start).trim();
  if (last) parts.push(last);
  return parts.length ? parts : [source];
}

export function nodesFromVerses(verses, { clauseSplit = true } = {}) {
  const nodes = [];
  for (const verse of verses) {
    const pieces = clauseSplit ? splitClauseText(verse.text) : [verse.text.trim()].filter(Boolean);
    for (const piece of pieces) {
      nodes.push({
        type: "prop",
        id: uid(),
        text: piece,
        verse: verse.verse ?? null,
        verseRef: verse.verseRef ?? null,
        note: "",
      });
    }
  }
  return nodes;
}

export function versesFromPlainText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  if (/\[\d+\]/.test(trimmed)) return parseEsvPassageText(trimmed, "").verses;
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((paragraph) => ({ verse: null, verseRef: null, text: paragraph }));
}

export const MAX_PROPOSITIONS = 500;
