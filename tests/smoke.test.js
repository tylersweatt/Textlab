import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
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

test("the service worker cache list is versioned and updates on request", () => {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  assert.match(sw, /textlab-v3/);
  assert.match(sw, /SKIP_WAITING/);
  for (const asset of ["./index.html", "./css/app.css", "./js/app.js", "./js/view.js", "./js/storage.js", "./manifest.webmanifest"]) {
    assert.match(sw, new RegExp(asset.replace(".", "\\.")));
  }
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

const CHROME_BINS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/local/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** Session-bus chatter. A missing bus must not decide whether the page rendered. */
const DBUS_NOISE = /dbus|Failed to connect to the bus|NameHasOwner|object_proxy|bus\.cc/i;

function chromeLaunch(binary, url, profile) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-features=MediaRouter,HardwareMediaKeyHandling,GlobalMediaControls",
    `--user-data-dir=${profile}`,
    "--virtual-time-budget=4000",
    "--dump-dom",
    url,
  ];
  // ubuntu-latest (26.04) publishes a session-bus address Chrome cannot parse
  // ("Unknown address type"). Leaving the variable unset makes libdbus try to
  // autolaunch a bus and the headless process never reaches --dump-dom; the
  // test then kills it and the only text left is the bus error. Point both
  // buses at a socket that refuses immediately so Chrome logs the failure and
  // continues. NO_AT_BRIDGE stops the accessibility bus from being started,
  // which otherwise waits out the same timer.
  const env = {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/dev/null",
    DBUS_SYSTEM_BUS_ADDRESS: "unix:path=/dev/null",
    NO_AT_BRIDGE: "1",
  };
  return { command: binary, args, env };
}

function renderFailure(stderr, code, signal) {
  const extra = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !DBUS_NOISE.test(line))
    .slice(-8)
    .join("\n");
  const why = signal
    ? `Chrome was killed (${signal}) before the page rendered.`
    : `Chrome exited ${code} before the page rendered.`;
  return extra ? `${why}\n${extra}` : why;
}

function dumpPage(binary, url) {
  const profile = mkdtempSync(join(tmpdir(), "textlab-chrome-"));
  const launch = chromeLaunch(binary, url, profile);
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, { env: launch.env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rmSync(profile, { recursive: true, force: true });
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code, signal) => {
      if (stdout.includes("TextLab")) finish(null, stdout);
      else finish(new Error(renderFailure(stderr, code, signal)));
    });
  });
}

test("the page loads in a browser", async (t) => {
  const chrome = CHROME_BINS.find((path) => existsSync(path));
  if (!chrome) {
    t.skip("Chrome is not installed");
    return;
  }
  const server = await startServer();
  const { port } = server.address();
  try {
    const dump = await dumpPage(chrome, `http://127.0.0.1:${port}/`);
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
