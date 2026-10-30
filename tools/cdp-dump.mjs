// Dump the rendered DOM of one page through the Chrome DevTools Protocol.
//
// Why this exists: `msedge --dump-dom` stopped producing anything on this machine
// after Edge 156.0.4314.50 — the launcher process exits 0 within milliseconds
// while the real browser process starts detached, so the DOM goes to a stdout
// nobody holds. Edge itself is healthy (it creates the profile, CDP answers), so
// the measure scripts read the DOM over CDP instead of parsing launcher stdout.
//
// Usage:  node tools/cdp-dump.mjs <out.html> <url> [width] [height] [budgetMs] [edgeExe]
// Exit 0 only when a DOM was written; anything else exits non-zero with a reason
// on stderr, so a calling script fails loudly instead of Regex-ing a missing file.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [outPath, url, widthArg = "1400", heightArg = "900", budgetArg = "6000", exeArg] = process.argv.slice(2);
if (!outPath || !url) {
  console.error("usage: cdp-dump.mjs <out.html> <url> [width] [height] [budgetMs] [edgeExe]");
  process.exit(2);
}

const width = Number(widthArg) || 1400;
const height = Number(heightArg) || 900;
const budget = Number(budgetArg) || 6000;
const EDGE_CANDIDATES = [
  exeArg,
  process.env.WF_EDGE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const exe = EDGE_CANDIDATES.find((candidate) => existsSync(candidate));
if (!exe) {
  console.error(`no browser binary found; tried ${EDGE_CANDIDATES.join(", ")}`);
  process.exit(3);
}

const profile = mkdtempSync(path.join(tmpdir(), "wf-cdp-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The page URL goes on the command line: a headless instance started on
// about:blank exposes no `page` target for the first second or so, and passing
// the URL up front is cheaper than opening a browser-level session.
const child = spawn(
  exe,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    // `--virtual-time-budget` is deliberately NOT passed: headless Edge quits as soon
    // as the budget is consumed, which closes the socket before the DOM is read
    // (the old --dump-dom path had the same problem). The sleep below is the settle gate.
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    url,
  ],
  { stdio: "ignore" },
);

let socket = null;
let settled = false;
const cleanup = () => {
  if (settled) return;
  settled = true;
  try { socket?.close(); } catch { /* already gone */ }
  try { child.kill(); } catch { /* already gone */ }
  setTimeout(() => {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock, leave it */ }
  }, 400);
};
const fail = (message, code = 1) => {
  console.error(message);
  cleanup();
  process.exit(code);
};

// The launcher picks a free port and announces it here; nothing collides.
const portFile = path.join(profile, "DevToolsActivePort");
let port = 0;
for (let attempt = 0; attempt < 120 && !port; attempt += 1) {
  await sleep(100);
  if (!existsSync(portFile)) continue;
  const firstLine = readFileSync(portFile, "utf8").split("\n")[0]?.trim();
  if (firstLine) port = Number(firstLine) || 0;
}
if (!port) fail("the browser never announced a DevTools port", 4);

let pageWs = "";
for (let attempt = 0; attempt < 100 && !pageWs; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    const page = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
    if (page) pageWs = page.webSocketDebuggerUrl;
  } catch { /* the endpoint may not answer yet */ }
  if (!pageWs) await sleep(100);
}
if (!pageWs) fail("CDP reported no page target", 5);

socket = new WebSocket(pageWs);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("web socket open timed out")), 10000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("web socket error")); });
}).catch((error) => fail(error.message, 6));

let nextId = 0;
const waiting = new Map();
socket.addEventListener("message", (event) => {
  let message = null;
  try { message = JSON.parse(event.data); } catch { return; }
  if (!message.id || !waiting.has(message.id)) return;
  const pending = waiting.get(message.id);
  waiting.delete(message.id);
  if (message.error) pending.reject(new Error(message.error.message || "CDP error"));
  else pending.resolve(message.result);
});
socket.addEventListener("close", () => {
  for (const [id, pending] of waiting) {
    waiting.delete(id);
    pending.reject(new Error("the browser closed the DevTools socket"));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (nextId += 1);
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

try {
  await send("Page.enable");
  await send("Runtime.enable");
  // The page is already navigating from the command line. `budget` also went in as
  // --virtual-time-budget, so timers have advanced; the sleep is what lets the
  // page's own measuring script write its block before it is read.
  await sleep(Math.min(Math.max(budget, 800), 4500));
  const evaluated = await send("Runtime.evaluate", {
    expression: "document.documentElement.outerHTML",
    returnByValue: true,
    awaitPromise: false,
  });
  const html = evaluated?.result?.value;
  if (typeof html !== "string" || html.length < 100) fail(`the page returned no usable DOM (${url})`, 7);
  writeFileSync(outPath, html, "utf8");
  console.log(`dom ${html.length} bytes -> ${outPath}`);
  await send("Browser.close").catch(() => {});
  cleanup();
  process.exit(0);
} catch (error) {
  fail(`dump failed for ${url}: ${error.message}`, 8);
}