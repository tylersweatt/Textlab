import { EsvError } from "./esv-error.js";
import { parseEsvResponse } from "./passage.js";

/** https://api.esv.org/docs/passage-text/ — GET, Authorization: Token KEY. */
export const PASSAGE_TEXT_URL = "https://api.esv.org/v3/passage/text/";

/**
 * Notice required on a page that quotes the ESV.
 * https://api.esv.org/ (standard copyright notice).
 */
export const STANDARD_ESV_NOTICE =
  "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.";

const PASSAGE_PARAMS = {
  "include-passage-references": "true",
  "include-verse-numbers": "true",
  "include-first-verse-numbers": "true",
  "include-footnotes": "false",
  "include-footnote-body": "false",
  "include-headings": "false",
  "include-short-copyright": "false",
  "include-copyright": "true",
  "include-selahs": "true",
  "indent-paragraphs": "0",
  "indent-poetry": "false",
  "line-length": "0",
};

export function buildPassageUrl(reference) {
  const params = new URLSearchParams();
  params.set("q", String(reference ?? "").trim());
  for (const [key, value] of Object.entries(PASSAGE_PARAMS)) params.set(key, value);
  return `${PASSAGE_TEXT_URL}?${params.toString()}`;
}

export function passageAuthHeader(apiKey) {
  return `Token ${String(apiKey ?? "").trim()}`;
}

export function studyCopyright(study) {
  if (!study || study.translation !== "ESV") return null;
  const attached = study.copyrightNotice?.trim();
  return attached || STANDARD_ESV_NOTICE;
}

export async function fetchEsvPassage(reference, apiKey, fetchImpl = globalThis.fetch) {
  const query = String(reference ?? "").trim();
  if (!query) throw new EsvError("empty", "Enter a passage reference, such as John 3:16.");
  const key = String(apiKey ?? "").trim();
  if (!key) {
    throw new EsvError("missing-key", "Add your ESV API key in Settings, or paste the passage instead.");
  }
  const url = buildPassageUrl(query);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: passageAuthHeader(key) },
    });
  } catch {
    throw new EsvError("network", "Could not reach the ESV API. Check your connection, or paste the passage.");
  }
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : "";
    if (response.status === 401 || response.status === 403) {
      throw new EsvError("bad-key", "The ESV API rejected that key. Check it in Settings.");
    }
    if (response.status === 429) {
      throw new EsvError("rate", "The ESV API rate limit was reached. Wait a minute and try again.");
    }
    throw new EsvError("http", detail || `The ESV API returned an error (${response.status}).`);
  }
  return parseEsvResponse(body);
}
