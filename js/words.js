/** Word identity for ESV passages. Punctuation may move when a line is split; the words may not. */

const PUNCTUATION = /[.,;:!?()[\]{}"""''«»“”‘’]/g;

export function scriptureWords(text) {
  return String(text ?? "")
    .replace(/[—–]/g, " ")
    .replace(PUNCTUATION, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function sameWords(a, b) {
  const left = scriptureWords(a);
  const right = scriptureWords(b);
  if (left.length !== right.length) return false;
  return left.every((word, index) => word === right[index]);
}

/** Character index where word `wordIndex` begins. Words are runs of non-whitespace. */
export function charIndexOfWord(text, wordIndex) {
  const re = /\S+/g;
  let match;
  let index = 0;
  while ((match = re.exec(text))) {
    if (index === wordIndex) return match.index;
    index += 1;
  }
  return -1;
}

export function wordCount(text) {
  return text.match(/\S+/g)?.length ?? 0;
}
