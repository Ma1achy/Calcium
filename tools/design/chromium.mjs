// The design page's browser: a pinned headless Chromium, and the runner that
// executes the page's own conformance checks in it (AUTHORITY.md §Browser
// conformance; DEPENDENCIES.md §Fetched outside npm; A04 §3).
//
//     node tools/design/chromium.mjs install       # fetch, verify the digest, unpack
//     node tools/design/chromium.mjs self-test     # fabricated failures must be refused
//     node tools/design/chromium.mjs check <page>  # every flag pass, no console error
//
// **No npm package.** Playwright and Puppeteer each drive a browser for one page
// load, one evaluate and a console listener; this speaks the DevTools protocol
// over `--remote-debugging-pipe` — NUL-terminated JSON on fds 3 and 4 — and the
// npm tree gains nothing.
//
// **Why the protocol and not `--dump-dom`.** `--dump-dom` answers the flags, and
// `--enable-logging` prints console messages without their level, so *no console
// error* could not be told from *a console.log*. The protocol reports the level,
// and an uncaught exception as its own event.
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/**
 * **One version, two artefacts.** Google publishes no linux-arm64 build, so the
 * devcontainer takes Playwright's build of the same version. The digests are
 * first-download pins taken 2026-09-27 — neither host publishes one — so what
 * they prove is *unchanged since*, not *authentic*; DEPENDENCIES.md says so.
 */
export const PIN = Object.freeze({
  version: "153.0.8010.12",
  x64: Object.freeze({
    url: "https://storage.googleapis.com/chrome-for-testing-public/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip",
    sha256: "a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d",
    bin: "chrome-headless-shell-linux64/chrome-headless-shell",
  }),
  arm64: Object.freeze({
    url: "https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/chromium/1243/chromium-headless-shell-linux-arm64.zip",
    sha256: "3a2bc2c354fb66615ee329c2ab13cd1312b40294798bea04c5dc0053caa6b881",
    bin: "chrome-linux/headless_shell",
  }),
});

/** The five flags the page sets on `<html>`, compared by equality. */
export const FLAGS = Object.freeze(["carrierCheck", "cursorPhaseCheck", "glyphGridCheck", "specCheck", "spinnerCapabilityCheck"]);

const artefact = () => {
  const a = PIN[process.arch];
  if (process.platform !== "linux" || a === undefined) {
    throw new Error(`no pinned Chromium for ${process.platform}/${process.arch} — run this in the devcontainer or CI`);
  }
  return a;
};
const cacheDir = () => join(root, ".cache", "chromium", PIN.version, process.arch);
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Refuse, and remove, an archive whose digest is not the pinned one. */
export function verifyZip(zip, pinned, from) {
  const got = sha256(zip);
  if (got !== pinned) {
    rmSync(zip);
    throw new Error(`digest mismatch for ${from}: got ${got}, pinned ${pinned} — the file was removed, nothing was unpacked`);
  }
}

/** Fetch if absent, verify the zip's digest every time, unpack if the binary is missing. */
export async function install() {
  const a = artefact();
  const dir = cacheDir();
  const zip = join(dir, "artefact.zip");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(zip)) {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`fetch ${a.url}: HTTP ${String(res.status)}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  verifyZip(zip, a.sha256, a.url);
  const bin = join(dir, a.bin);
  if (!existsSync(bin)) {
    const r = spawnSync("unzip", ["-q", "-o", zip, "-d", dir], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`unzip: ${r.stderr}`);
  }
  if (!existsSync(bin)) throw new Error(`unpacked, but ${a.bin} is not in the archive`);
  return bin;
}

/** The installed binary, or an error saying which step was skipped. */
function binary() {
  const bin = join(cacheDir(), artefact().bin);
  if (!existsSync(bin)) throw new Error(`Chromium ${PIN.version} is not installed — run \`make chromium\``);
  return bin;
}

/**
 * Load one page and report its flags and its errors.
 *
 * **`--no-sandbox`, deliberately**: the subject is a file this repository
 * generated, the devcontainer runs as root (where the sandbox refuses to start)
 * and Ubuntu 24.04 runners restrict the unprivileged user namespaces it needs.
 */
export function load(page, { timeoutMs = 30_000, query = "" } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "calcium-chromium-"));
  const child = spawn(binary(), [
    "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--remote-debugging-pipe", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const [, , , toChrome, fromChrome] = child.stdio;

  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const id = ++nextId;
    pending.set(id, { ok, no, method });
    toChrome.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  let buffer = "";
  fromChrome.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const msg = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.no(new Error(`${p.method}: ${msg.error.message}`));
        else p.ok(msg.result);
      } else if (msg.method) {
        for (const l of listeners) l(msg);
      }
    }
  });

  const errors = [];
  const run = async () => {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    let loaded;
    const loadFired = new Promise((ok) => { loaded = ok; });
    listeners.push((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Page.loadEventFired") loaded();
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        errors.push(`uncaught: ${d.exception?.description ?? d.text}`);
      }
      if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "assert")) {
        errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      }
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        errors.push(`log: ${m.params.entry.text}${m.params.entry.url ? ` (${m.params.entry.url})` : ""}`);
      }
    });
    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: pathToFileURL(resolve(page)).href + query }, sessionId);
    await loadFired;
    const { result } = await send("Runtime.evaluate", {
      expression: "JSON.stringify({ html: Object.assign({}, document.documentElement.dataset), body: Object.assign({}, document.body.dataset), spinners: document.querySelectorAll('.sp').length, applied: document.querySelectorAll('.sp[data-spinner-capability]').length })",
      returnByValue: true,
    }, sessionId);
    const read = JSON.parse(result.value);
    const flags = Object.fromEntries(Object.entries(read.html).filter(([k]) => k.endsWith("Check")));
    return { flags, errors, body: read.body, spinners: read.spinners, applied: read.applied };
  };

  let timer;
  const timeout = new Promise((_, no) => {
    timer = setTimeout(() => no(new Error(`${page}: no load event in ${String(timeoutMs)} ms`)), timeoutMs);
  });
  const exited = new Promise((_, no) => {
    child.on("exit", (code) => no(new Error(`Chromium exited (${String(code)}) before the page reported`)));
  });
  return Promise.race([run(), timeout, exited]).finally(() => {
    clearTimeout(timer);
    child.removeAllListeners("exit");
    child.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  });
}

/** Every reason the report is not a pass — empty when it is. */
export function verdict({ flags, errors }) {
  const out = [];
  const have = Object.keys(flags).sort();
  if (JSON.stringify(have) !== JSON.stringify([...FLAGS])) {
    out.push(`flags ${have.join(",") || "none"} ≠ expected ${FLAGS.join(",")}`);
  }
  for (const [k, v] of Object.entries(flags)) if (v !== "pass") out.push(`${k} = ${v}`);
  out.push(...errors);
  return out;
}

/**
 * **The spinner capability resolver's four routes, executed.** They were text
 * searches over the resolver's source — `requested==='ascii'` and three more —
 * which say the branch is written and nothing about what it does. Each route is
 * a query the page reads; the body's dataset is what the resolver did.
 */
export const ROUTES = Object.freeze([
  Object.freeze({ query: "", capability: "unicode-narrow", source: "rich-preview-default" }),
  Object.freeze({ query: "?glyphs=ascii", capability: "ascii", source: "query" }),
  Object.freeze({ query: "?glyphs=unicode", capability: "unicode-narrow", source: "query" }),
  Object.freeze({ query: "?glyphs=auto", capability: "unicode-narrow", source: "measured-per-set", perSet: true }),
]);

/** Every route's reasons, each prefixed by the route — empty when all pass. */
export async function checkPage(page) {
  const out = [];
  for (const route of ROUTES) {
    const report = await load(page, { query: route.query });
    const tag = route.query === "" ? "(default)" : route.query;
    for (const r of verdict(report)) out.push(`${tag} ${r}`);
    if (report.body.glyphCapability !== route.capability) out.push(`${tag} glyph capability ${String(report.body.glyphCapability)} ≠ ${route.capability}`);
    if (report.body.spinnerCapabilitySource !== route.source) out.push(`${tag} capability source ${String(report.body.spinnerCapabilitySource)} ≠ ${route.source}`);
    if (route.perSet) {
      if (report.spinners === 0) out.push(`${tag} no spinner on the page — the per-set route has nothing to apply to`);
      if (report.applied !== report.spinners) out.push(`${tag} ${String(report.applied)} of ${String(report.spinners)} spinners carry a per-set capability`);
      if (report.body.spinnerCapabilityMix === undefined) out.push(`${tag} no capability mix recorded`);
    } else if (report.applied !== 0) {
      out.push(`${tag} ${String(report.applied)} spinners carry a per-set capability on a global route`);
    }
  }
  return out;
}

const PASS_ALL = FLAGS.map((f) => `document.documentElement.dataset.${f}='pass';`).join("");
const page = (script) => `<!doctype html><html><head><meta charset=utf-8></head><body><script>${script}</script></body></html>`;

/**
 * **The runner proves it can see a failure before it is believed.** Each
 * fabricated page is loaded through the same browser and must be refused for
 * its own reason; the clean page is the control, so a runner that refused
 * everything cannot pass either.
 */
export async function selfTest() {
  const cases = [
    { name: "clean", html: page(PASS_ALL), expect: null },
    { name: "a flag reads fail", html: page(PASS_ALL + "document.documentElement.dataset.glyphGridCheck='fail';"), expect: /glyphGridCheck = fail/u },
    { name: "a flag is absent", html: page(PASS_ALL + "delete document.documentElement.dataset.cursorPhaseCheck;"), expect: /flags .* ≠ expected/u },
    { name: "an unexpected flag", html: page(PASS_ALL + "document.documentElement.dataset.extraCheck='pass';"), expect: /flags .*extraCheck.* ≠ expected/u },
    { name: "console.error", html: page(PASS_ALL + "console.error('fabricated');"), expect: /console\.error: fabricated/u },
    { name: "an uncaught throw", html: page(PASS_ALL) + "<script>throw new Error('fabricated throw')</script>", expect: /uncaught: .*fabricated throw/u },
  ];
  const dir = mkdtempSync(join(tmpdir(), "calcium-selftest-"));
  const problems = [];
  // A page that routes as the resolver does, and one that ignores the query.
  const ROUTER = `const q=new URLSearchParams(location.search).get('glyphs'),b=document.body.dataset;
    if(q==='ascii'){b.glyphCapability='ascii';b.spinnerCapabilitySource='query'}
    else if(q==='unicode'){b.glyphCapability='unicode-narrow';b.spinnerCapabilitySource='query'}
    else if(q==='auto'){b.glyphCapability='unicode-narrow';b.spinnerCapabilitySource='measured-per-set';b.spinnerCapabilityMix='unicode-narrow';for(const n of document.querySelectorAll('.sp'))n.dataset.spinnerCapability='unicode-narrow'}
    else{b.glyphCapability='unicode-narrow';b.spinnerCapabilitySource='rich-preview-default'}`;
  const routed = (script) => `<!doctype html><html><head><meta charset=utf-8></head><body><span class="sp sp-x"></span><span class="sp sp-y"></span><script>${PASS_ALL}${script}</script></body></html>`;
  const routeCases = [
    { name: "router-clean", html: routed(ROUTER), expect: null },
    { name: "router-ignores-query", html: routed("document.body.dataset.glyphCapability='unicode-narrow';document.body.dataset.spinnerCapabilitySource='rich-preview-default';"), expect: /\?glyphs=ascii glyph capability unicode-narrow ≠ ascii/u },
    { name: "router-skips-a-set", html: routed(ROUTER + "document.querySelector('.sp-y').removeAttribute('data-spinner-capability');"), expect: /\?glyphs=auto 1 of 2 spinners/u },
  ];
  try {
    for (const c of routeCases) {
      const file = join(dir, `${c.name}.html`);
      writeFileSync(file, c.html);
      const reasons = await checkPage(file);
      if (c.expect === null && reasons.length > 0) problems.push(`${c.name}: the control was refused — ${reasons.join("; ")}`);
      if (c.expect !== null && !reasons.some((r) => c.expect.test(r))) {
        problems.push(`${c.name}: not refused for its reason — got ${reasons.join("; ") || "a pass"}`);
      }
    }
    for (const c of cases) {
      const file = join(dir, `${c.name.replace(/\W+/gu, "-")}.html`);
      writeFileSync(file, c.html);
      const reasons = verdict(await load(file));
      if (c.expect === null && reasons.length > 0) problems.push(`${c.name}: the control was refused — ${reasons.join("; ")}`);
      if (c.expect !== null && !reasons.some((r) => c.expect.test(r))) {
        problems.push(`${c.name}: not refused for its reason — got ${reasons.join("; ") || "a pass"}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // A changed archive is refused and removed before anything is unpacked.
  const fake = join(mkdtempSync(join(tmpdir(), "calcium-zip-")), "artefact.zip");
  writeFileSync(fake, "not the pinned archive");
  try {
    verifyZip(fake, PIN.arm64.sha256, "a fabricated archive");
    problems.push("archive: a fabricated archive passed the digest check");
  } catch (e) {
    if (!/digest mismatch/u.test(e.message)) problems.push(`archive: the digest check failed for another reason: ${e.message}`);
    if (existsSync(fake)) problems.push("archive: the refused archive was left on disk");
  }
  rmSync(dirname(fake), { recursive: true, force: true });

  // The record and the pin cannot drift apart: SS31 does not read this section.
  const deps = readFileSync(join(root, "DEPENDENCIES.md"), "utf8");
  const section = deps.slice(deps.indexOf("## Fetched outside npm"), deps.indexOf("## What is deliberately NOT"));
  for (const needle of [PIN.version, PIN.x64.sha256, PIN.arm64.sha256]) {
    if (!section.includes(needle)) problems.push(`record: DEPENDENCIES.md §Fetched outside npm does not name ${needle}`);
  }
  return { cases: cases.length + routeCases.length, problems };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === "install") {
      const bin = await install();
      console.log(`Chromium ${PIN.version} · ${process.arch} · sha256 verified · ${bin.slice(root.length + 1)}`);
    } else if (cmd === "self-test") {
      const { cases, problems } = await selfTest();
      for (const p of problems) console.error(`  ${p}`);
      if (problems.length > 0) { console.error(`FAIL · self-test · ${String(problems.length)} problems`); process.exit(1); }
      console.log(`OK · self-test · ${String(cases - 2)} fabricated pages refused, both clean controls passed, a changed archive refused, the record names the pin`);
    } else if (cmd === "check" && arg !== undefined) {
      const reasons = await checkPage(arg);
      for (const r of reasons) console.error(`  ${r}`);
      if (reasons.length > 0) { console.error(`FAIL · ${arg} · ${String(reasons.length)} problems in Chromium ${PIN.version}`); process.exit(1); }
      console.log(`OK · ${arg} · ${String(ROUTES.length)} routes · ${String(FLAGS.length)} flags pass on each, the resolver answered each route, no console error, in Chromium ${PIN.version}`);
    } else {
      console.error("usage: chromium.mjs install | self-test | check <page>");
      process.exit(2);
    }
  } catch (e) {
    console.error(`FAIL · ${e.message}`);
    process.exit(1);
  }
}
