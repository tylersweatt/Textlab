import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawn } from "node:child_process";
import { propTexts } from "../js/model.js";
import { sampleStudy } from "../js/sample.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the sample study loads as a usable bracket", () => {
  const study = sampleStudy();
  assert.equal(propTexts(study).length, 4);
  assert.equal(study.nodes[0].type, "group");
});

test("index.html is an installable app shell", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /apple-mobile-web-app-title/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /js\/app\.js/);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(existsSync(join(root, "sw.js")));
});

test("the service worker caches every module the app imports", () => {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const pending = ["js/app.js"];
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/from "\.\/(.+?\.js)"/g)) {
      pending.push(`js/${match[1]}`);
    }
    assert.match(sw, new RegExp(file.replace(".", "\\.")));
  }
});

function startServer() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = normalize(join(root, pathname));
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("missing");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("the page loads in a browser", async (t) => {
  const chrome = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((path) => existsSync(path));
  if (!chrome) {
    t.skip("Chrome is not installed");
    return;
  }
  const server = await startServer();
  const { port } = server.address();
  try {
    const dump = await new Promise((resolve, reject) => {
      const child = spawn(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${join(root, ".chrome-smoke")}`,
        "--virtual-time-budget=4000",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ]);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 12000);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", () => {
        clearTimeout(timer);
        if (!stdout.includes("TextLab")) reject(new Error(stderr.slice(-500) || "Chrome did not render TextLab"));
        else resolve(stdout);
      });
    });
    assert.match(dump, /TextLab/);
    assert.match(dump, /John 3:16/);
    assert.match(dump, /id="gutter"/);
    assert.match(dump, />Ac</);
    assert.match(dump, />Res</);
    assert.match(dump, />16a</);
    assert.match(dump, /begotten/);
    assert.match(dump, /whosoever/);
    assert.match(dump, /cj-dist/);
  } finally {
    server.close();
  }
});
