// The sweep: every mutation run under `tools/mutate/runs/`, serially, with the
// tree hashed either side of each — so a mutation that went vacuous is dated by
// a machine on a schedule rather than by the next person who happens to run
// the pass (F952, F990).
//
// **A run with no row that sees a mutation reads exactly like one that does
// until the pass is run.** The anchors sweep (`anchors.mjs`) proves that every
// anchor still resolves; it cannot say whether the mutation still fails a row,
// and nothing else asks. A pass is a session's work per component when done
// by hand, which is why the runs rotted (F980: 18 of 283 anchors stale, two of
// them controls). This runs them all — sharded for CI, filtered for a desk —
// and the run's own exit code is the verdict, because every run already
// decides for itself whether a survivor is honest (`EXPECTED_SURVIVORS`).
//
// **What the sweep tolerates and what it does not.** A run on `KNOWN_STALE`'s
// debt list exits non-zero on exactly the anchor misses the list records, and
// that is *known-stale*, reported and not red — the list is compared by
// equality in `anchors.mjs`, which runs first. Anything else non-zero is red:
// a survivor, an anchor miss off the list, a mutation that did not build, a
// harness that reached no summary. And a run that leaves the tree changed —
// a killed pass, a restore that missed — is restored from the snapshot taken
// before it and reported as red, because a live mutation in `src/` is the one
// state the next gate would measure as the subject (CLAUDE.md, *never edit
// src while a mutation pass runs*).
//
// **Stated blind spot**: the run's exit is the authority. A run that prints a
// survivor and exits 0 without an `EXPECTED_SURVIVORS` tail is green here; the
// harness's own `report()` and the anchors sweep are what watch that shape,
// and `test/unit/mutate-sweep.test.ts` records the case as its control.
//
// Run: node tools/mutate/sweep.mjs [--shard k/n] [--only substring] [--list]
//      [--out out/mutate-sweep] [--skip-anchors]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

/** Lines of a red run's log to print. Enough for a throw and its stack, or a survivor table. */
const LOG_TAIL = 30;
import { join } from "node:path";

export const RUNS_DIR = "tools/mutate/runs";
export const ANCHORS = "tools/mutate/anchors.mjs";
/** The tree a run may mutate: sources and the enforcement rules, never the runs. */
export const WATCHED = ["src", "tools/enforce"];

/** Every run, sorted — the order is the shard key, so it must be stable. */
export function discoverRuns(dir = RUNS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
}

/** Shard `k` of `n` (1-based), round-robin over the sorted list: sizes differ by at most one. */
export function shardOf(runs, k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 1 || k > n) {
    throw new Error(`shard must be k/n with 1 ≤ k ≤ n, got ${String(k)}/${String(n)}`);
  }
  return runs.filter((_r, i) => i % n === k - 1);
}

export function parseArgs(argv) {
  const out = { shard: null, only: null, list: false, out: "out/mutate-sweep", skipAnchors: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--shard") {
      const m = /^(\d+)\/(\d+)$/.exec(argv[i + 1] ?? "");
      if (m === null) throw new Error(`--shard wants k/n, got ${String(argv[i + 1])}`);
      out.shard = { k: Number(m[1]), n: Number(m[2]) };
      i += 1;
    } else if (a === "--only") { out.only = argv[i + 1] ?? ""; i += 1; }
    else if (a === "--out") { out.out = argv[i + 1] ?? out.out; i += 1; }
    else if (a === "--list") out.list = true;
    else if (a === "--skip-anchors") out.skipAnchors = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

/**
 * `KNOWN_STALE` read off `anchors.mjs`'s source as text — importing the file
 * would run its sweep, and the list's shape is one entry per line.
 */
export function knownStale(anchorsSource) {
  const start = anchorsSource.indexOf("const KNOWN_STALE = {");
  if (start === -1) throw new Error("anchors.mjs holds no KNOWN_STALE block");
  const end = anchorsSource.indexOf("\n};", start);
  const block = anchorsSource.slice(start, end);
  const out = {};
  for (const m of block.matchAll(/^\s*"([^"]+\.mjs)":\s*(\d+),/gm)) out[m[1]] = Number(m[2]);
  return out;
}

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** The counts a run's report carries, read off its own state column (`report()` in `mutate.mjs`). */
export function summarise(output) {
  const s = { caught: 0, elsewhere: 0, survived: 0, anchorMissed: 0, unbuilt: 0, noSummary: 0, expected: 0, staleExemption: 0 };
  for (const raw of strip(output).split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("caught ")) s.caught += 1;
    else if (line.startsWith("CAUGHT ELSEWHERE")) s.elsewhere += 1;
    else if (line.startsWith("SURVIVED")) s.survived += 1;
    else if (line.startsWith("ANCHOR MISSED")) s.anchorMissed += 1;
    else if (line.startsWith("DID NOT BUILD")) s.unbuilt += 1;
    else if (line.startsWith("NO SUMMARY")) s.noSummary += 1;
    else if (line.startsWith("EXPECTED SURVIVOR")) s.expected += 1;
    else if (line.startsWith("EXEMPTION IS STALE")) s.staleExemption += 1;
  }
  return s;
}

/**
 * `green` on the run's own word; `known-stale` when the only thing wrong is
 * the anchor misses the debt list records for it; `red` otherwise.
 */
export function verdict(run, exit, summary, stale) {
  if (exit === 0) return "green";
  const owed = stale[run] ?? 0;
  const onlyKnown =
    owed > 0 && summary.anchorMissed === owed && summary.survived === 0 &&
    summary.unbuilt === 0 && summary.noSummary === 0 && summary.staleExemption === 0;
  return onlyKnown ? "known-stale" : "red";
}

function snapshot(root) {
  const files = new Map();
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const p = `${rel}/${name}`;
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (/\.(ts|mjs|mts)$/.test(name)) files.set(p, readFileSync(join(root, p)));
    }
  };
  for (const d of WATCHED) walk(d);
  return files;
}

function digest(files) {
  const h = createHash("md5");
  for (const [p, bytes] of files) { h.update(p); h.update(bytes); }
  return h.digest("hex");
}

/**
 * **A red run's own log, tailed** (F1097). The logs are written beside
 * `summary.json` and nothing read them back, so a red shard on a runner produced
 * one line — `exit 1  10s  caught 0  survived 0` — while the sentence explaining
 * it sat in a file that goes away with the workspace. Both reds of the first
 * sweep this repository ever ran were diagnosed by reproducing them locally,
 * which is a reproduction spent on something the run already knew.
 *
 * Tailed rather than printed whole: a run's log is a vitest transcript per
 * mutation, and the reason a pass is red is at the end of it — a throw, a
 * survivor table, or the harness refusing because the baseline already failed.
 *
 * `readFile` is injected for the reason every rule in `tools/enforce/` injects
 * it: this is only known to work once it has been shown to produce the lines,
 * and a row cannot manufacture a red run of the real sweep.
 *
 * A log that cannot be read is skipped rather than reported — the run's own row
 * is already printed above it, and a missing log is what `--list` leaves behind.
 */
export function redTails(red, out, readFile, tail = LOG_TAIL) {
  const lines = [];
  for (const r of red) {
    let log;
    try { log = readFile(`${out}/${r.run}.log`); } catch { continue; }
    const body = log.trimEnd().split("\n");
    const shown = Math.min(tail, body.length);
    lines.push(`\n  ── ${r.run}, last ${String(shown)} of ${String(body.length)} lines ──`);
    for (const line of body.slice(-tail)) lines.push(`  │ ${line}`);
  }
  return lines;
}

export function plan(args, all) {
  const filtered = args.only === null ? all : all.filter((r) => r.includes(args.only));
  return args.shard === null ? filtered : shardOf(filtered, args.shard.k, args.shard.n);
}

function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const all = discoverRuns();
  const mine = plan(args, all);
  const label = args.shard === null ? "all" : `shard ${String(args.shard.k)}/${String(args.shard.n)}`;
  console.log(`mutation sweep — ${String(mine.length)} of ${String(all.length)} runs (${label}${args.only === null ? "" : `, only "${args.only}"`})`);
  if (args.list) { for (const r of mine) console.log(`  ${r}`); return 0; }

  mkdirSync(join(root, args.out), { recursive: true });
  if (!args.skipAnchors) {
    const a = spawnSync("node", [ANCHORS], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(root, args.out, "anchors.log"), `${a.stdout ?? ""}${a.stderr ?? ""}\nEXIT=${String(a.status)}\n`);
    if (a.status !== 0) { console.log(`  anchors sweep red (exit ${String(a.status)}) — nothing run; see ${args.out}/anchors.log`); return 1; }
    console.log("  anchors sweep green");
  }
  const stale = knownStale(readFileSync(join(root, ANCHORS), "utf8"));

  const rows = [];
  for (const run of mine) {
    const before = snapshot(root);
    const beforeHash = digest(before);
    const t0 = Date.now();
    const r = spawnSync("node", [join(RUNS_DIR, run)], {
      cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60 * 1000,
    });
    const seconds = Math.round((Date.now() - t0) / 1000);
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const exit = r.status ?? (r.signal === null ? -1 : -2);
    writeFileSync(join(root, args.out, `${run}.log`), `${output}\nEXIT=${String(exit)} SECONDS=${String(seconds)}\n`);
    const summary = summarise(output);
    let state = verdict(run, exit, summary, stale);
    const after = snapshot(root);
    let restored = 0;
    if (digest(after) !== beforeHash) {
      for (const [p, bytes] of before) {
        if (!after.has(p) || Buffer.compare(after.get(p), bytes) !== 0) { writeFileSync(join(root, p), bytes); restored += 1; }
      }
      state = "red";
    }
    rows.push({ run, exit, seconds, state, restored, ...summary });
    const tail = restored > 0 ? `  LEFT THE TREE MUTATED — ${String(restored)} file(s) restored from the snapshot` : "";
    console.log(`  ${state.padEnd(11)} ${run.padEnd(36)} exit ${String(exit).padStart(2)}  ${String(seconds).padStart(4)}s  caught ${String(summary.caught + summary.elsewhere)}  survived ${String(summary.survived)}  expected ${String(summary.expected)}  anchors missed ${String(summary.anchorMissed)}${tail}`);
  }
  const red = rows.filter((r) => r.state === "red");
  const knownStaleRows = rows.filter((r) => r.state === "known-stale");
  writeFileSync(join(root, args.out, "summary.json"), JSON.stringify({ label, only: args.only, rows }, null, 2));
  console.log(`\n${String(rows.length)} runs · ${String(rows.length - red.length - knownStaleRows.length)} green · ${String(knownStaleRows.length)} known-stale · ${String(red.length)} red${red.length > 0 ? `\n  red: ${red.map((r) => r.run).join(", ")}` : ""}`);

  for (const line of redTails(red, args.out, (f) => readFileSync(join(root, f), "utf8"))) console.log(line);
  return red.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && /[\\/]sweep\.mjs$/.test(process.argv[1])) process.exit(main());
