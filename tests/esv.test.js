import assert from "node:assert/strict";
import test from "node:test";
import { buildPassageUrl, fetchEsvPassage, passageAuthHeader, PASSAGE_TEXT_URL, studyCopyright } from "../js/esv.js";

test("passage URL matches the ESV passage-text endpoint and does not carry the key", () => {
  const url = new URL(buildPassageUrl("John 11:35"));
  assert.equal(`${url.origin}${url.pathname}`, PASSAGE_TEXT_URL);
  assert.equal(url.searchParams.get("q"), "John 11:35");
  assert.equal(url.searchParams.get("include-copyright"), "true");
  assert.equal(url.searchParams.get("include-short-copyright"), "false");
  assert.equal(url.searchParams.get("include-verse-numbers"), "true");
  assert.equal(url.searchParams.get("include-first-verse-numbers"), "true");
  assert.equal(url.searchParams.get("include-footnotes"), "false");
  assert.equal(url.searchParams.get("include-footnote-body"), "false");
  assert.equal(url.searchParams.get("include-headings"), "false");
  assert.equal(url.searchParams.get("include-passage-references"), "true");
  assert.equal(passageAuthHeader(" abc "), "Token abc");
  assert.equal(url.search.includes("abc"), false);
});

test("fetch sends Authorization: Token and parses the documented JSON shape", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        query: "John 11:35",
        canonical: "John 11:35",
        parsed: [[43011035, 43011035]],
        passage_meta: [{ canonical: "John 11:35" }],
        passages: ["John 11:35\n\n  [35] Jesus wept. (ESV)\n"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const result = await fetchEsvPassage("John 11:35", "secret-key", fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Token secret-key");
  assert.equal(calls[0].url.includes("secret-key"), false);
  assert.equal(result.canonical, "John 11:35");
  assert.equal(result.verses[0].text, "Jesus wept.");
  assert.deepEqual(result.esvVerseRefs, ["John 11:35"]);
});

test("a rejected key and a missing key are explained plainly", async () => {
  const forbidden = async () =>
    new Response(JSON.stringify({ detail: "Invalid application key in Authorization header." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(fetchEsvPassage("John 11:35", "nope", forbidden), /rejected that key/);
  await assert.rejects(fetchEsvPassage("John 11:35", "   ", forbidden), /Add your ESV API key/);
  await assert.rejects(fetchEsvPassage("   ", "key", forbidden), /Enter a passage/);
});

test("an empty passage is not stored as a study", async () => {
  const empty = async () =>
    new Response(JSON.stringify({ canonical: "", passages: [""] }), { status: 200 });
  await assert.rejects(fetchEsvPassage("Notabook 1:1", "key", empty), /No passage came back/);
});

test("ESV studies display a copyright notice", () => {
  const notice = studyCopyright({
    translation: "ESV",
    copyrightNotice: "Scripture quotations are from the ESV® Bible. Used by permission.",
  });
  assert.match(notice, /ESV/);
  assert.equal(studyCopyright({ translation: "paste" }), null);
  assert.match(studyCopyright({ translation: "ESV", copyrightNotice: "" }), /500 verses/);
});
