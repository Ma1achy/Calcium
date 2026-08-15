#!/usr/bin/env node
// spinner.js — a playground for agent-tui's ⏺ animation.
//
//   node spinner.js              all sequences, side by side
//   node spinner.js pulse        one sequence, big
//   node spinner.js --check      width/emoji audit only, no animation
//   node spinner.js --ms 80      override the tick
//
// Keys while running:  space next · shift+space prev · ↑/↓ speed · c check · q quit

// ── the candidate set ────────────────────────────────────────────────────────
// EA=Ambiguous or an emoji presentation form means the terminal may draw it two
// cells wide. A frame that is two cells where its neighbours are one reflows the
// row every tick, and it does not show on the machine that picked it.
const UNSAFE = {
  "·": "EA=Ambiguous — two cells in a CJK locale",
  "✽": "EA=Ambiguous — two cells in a CJK locale",
  "✳": "emoji presentation form",
  "✴": "emoji presentation form",
  "❄": "emoji presentation form",
  "❇": "emoji presentation form",
  "❈": "emoji presentation form",
  "✨": "emoji presentation form",
};

const SAFE = "❀❁❂❃❅❆✦✧✱✲✵✶✷✸✹✺✻✼✾✿✢".split("");

// ── the sequences — edit these, that is the point ────────────────────────────
const SEQ = {
  pulse:      "✢ ✲ ✱ ✻ ✱ ✲",
  bloom:      "✧ ✦ ✢ ✲ ✻ ✲ ✢ ✦",
  breathe:    "✢ ✲ ✻ ✺ ✻ ✲",
  florette:   "✿ ❀ ❁ ❂ ❁ ❀",
  spokes:     "✦ ✢ ✲ ✶ ✷ ✸ ✷ ✶ ✲ ✢",
  starfield:  "✶ ✷ ✸ ✹ ✺ ✹ ✸ ✷",
  wink:       "✧ ✦ ✧ ✦ ✧ ✢ ✲ ✱ ✲ ✢",
  heavy:      "✱ ✻ ✼ ✻",
  slow:       "✢ ✢ ✲ ✲ ✻ ✻ ✲ ✲",
  yours:      "· ✻ ✽ ✶ ✳ ✢",          // the original — three unsafe, kept as a control
  braille:    "⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏",  // the conventional one, for comparison
  ascii:      "- \\ | /",              // what spinnerFrames(caps) already returns
};

// ── the check ────────────────────────────────────────────────────────────────
const cells = (s) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length;

function audit(name, frames) {
  const bad = [];
  for (const f of frames) {
    if (UNSAFE[f]) bad.push([f, UNSAFE[f]]);
    else if (cells(f) !== 1) bad.push([f, `cells() = ${cells(f)}`]);
  }
  return bad;
}

function checkAll() {
  out("\n  width and presentation audit\n");
  let worst = 0;
  for (const [name, spec] of Object.entries(SEQ)) {
    const frames = spec.split(" ");
    const bad = audit(name, frames);
    worst = Math.max(worst, bad.length);
    const mark = bad.length === 0 ? "\x1b[32mok  \x1b[0m" : "\x1b[31mBAD \x1b[0m";
    out(`  ${mark} ${name.padEnd(10)} ${spec}`);
    for (const [f, why] of bad) out(`         \x1b[31m${f}\x1b[0m  ${why}`);
  }
  out(`\n  safe set: ${SAFE.join(" ")}\n`);
  return worst;
}

// ── rendering ────────────────────────────────────────────────────────────────
const out = (s) => process.stdout.write(s + "\n");
const w = (s) => process.stdout.write(s);
const HIDE = "\x1b[?25l", SHOW = "\x1b[?25h", HOME = "\x1b[H", CLEAR = "\x1b[2J";
const DIM = "\x1b[2m", RESET = "\x1b[0m", ACCENT = "\x1b[36m", OK = "\x1b[32m", ERR = "\x1b[31m";

const names = Object.keys(SEQ);

function frameAll(tick, ms) {
  const lines = [];
  lines.push(`${DIM}  spinner playground · ${ms}ms/frame · space next · ↑↓ speed · c check · q quit${RESET}`);
  lines.push("");
  for (const name of names) {
    const frames = SEQ[name].split(" ");
    const f = frames[tick % frames.length];
    const bad = audit(name, frames).length > 0;
    const flag = bad ? `${ERR}!${RESET}` : " ";
    lines.push(`  ${flag} ${ACCENT}${f}${RESET}  ${name.padEnd(10)} ${DIM}${SEQ[name]}${RESET}`);
  }
  lines.push("");
  lines.push(`${DIM}  in context:${RESET}`);
  lines.push("");
  const p = SEQ[names[0]].split(" ");
  const s = p[tick % p.length];
  lines.push(`  ${DIM}❯${RESET} refactor the parser to handle nested quotes`);
  lines.push("");
  lines.push(`  ${ACCENT}${s}${RESET} ${DIM}thinking · 4s · 312 tokens${RESET}`);
  lines.push("");
  lines.push(`  ${ACCENT}${s}${RESET} read_file(src/interaction/parser/parse.ts)`);
  lines.push(`    ${DIM}⎿ 184 lines · 6.2 KB${RESET}`);
  lines.push("");
  lines.push(`  ${OK}⏺${RESET} run_command(npm test) ${DIM}· settled${RESET}`);
  lines.push(`    ${DIM}⎿ 118 passed, 2 todo · exit 0${RESET}`);
  return lines.join("\n");
}

function frameOne(name, tick, ms) {
  const frames = SEQ[name].split(" ");
  const f = frames[tick % frames.length];
  const bad = audit(name, frames);
  const lines = [];
  lines.push(`${DIM}  ${name} · ${ms}ms/frame · ${frames.length} frames · space next · ↑↓ speed · q quit${RESET}`);
  lines.push("");
  lines.push(`      ${ACCENT}${f}${RESET}`);
  lines.push("");
  lines.push(`  ${DIM}${frames.map((x, i) => (i === tick % frames.length ? `${RESET}${x}${DIM}` : x)).join(" ")}${RESET}`);
  lines.push("");
  if (bad.length) {
    for (const [c, why] of bad) lines.push(`  ${ERR}! ${c}${RESET}  ${why}`);
  } else {
    lines.push(`  ${OK}✓${RESET} ${DIM}every frame one cell, no emoji form${RESET}`);
  }
  lines.push("");
  lines.push(`  ${DIM}❯${RESET} refactor the parser to handle nested quotes`);
  lines.push("");
  lines.push(`  ${ACCENT}${f}${RESET} ${DIM}thinking · 4s${RESET}`);
  lines.push("");
  lines.push(`  ${ACCENT}${f}${RESET} edit(src/interaction/parser/parse.ts)`);
  lines.push(`    ${DIM}⎿ ┌ parse.ts ──────────────────${RESET}`);
  lines.push(`    ${DIM}  │${RESET} ${ERR}41 - let inQuote = false;${RESET}`);
  lines.push(`    ${DIM}  │${RESET} ${OK}41 + let depth = 0;${RESET}`);
  lines.push(`    ${DIM}  └────────────────────────────${RESET}`);
  return lines.join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--check")) { process.exit(checkAll() ? 1 : 0); }

const msArg = argv.indexOf("--ms");
let ms = msArg >= 0 ? Number(argv[msArg + 1]) : 120;
let only = argv.find((a) => !a.startsWith("--") && names.includes(a));
let idx = only ? names.indexOf(only) : -1;

if (!process.stdout.isTTY) {
  // piped: print one static row per sequence and the audit, then stop.
  for (const name of names) out(`  ${SEQ[name].padEnd(28)} ${name}`);
  process.exit(checkAll() ? 1 : 0);
}

let tick = 0;
let timer = null;
w(HIDE + CLEAR);

function draw() {
  w(HOME + CLEAR);
  w(idx >= 0 ? frameOne(names[idx], tick, ms) : frameAll(tick, ms));
  tick++;
}
function restart() {
  if (timer) clearInterval(timer);
  timer = setInterval(draw, ms);
}
restart();

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on("data", (b) => {
  const k = b.toString();
  const quit = () => { if (timer) clearInterval(timer); w(SHOW + CLEAR + HOME); };
  if (k === "q" || k === "\x03") { quit(); process.exit(0); }
  if (k === "c") { quit(); checkAll(); process.exit(0); }
  if (k === " ") { idx = (idx + 1) % names.length; tick = 0; }
  if (k === "\x1b[Z") { idx = (idx - 1 + names.length) % names.length; tick = 0; }
  if (k === "a") { idx = -1; tick = 0; }
  if (k === "\x1b[A") { ms = Math.max(20, ms - 20); restart(); }
  if (k === "\x1b[B") { ms = Math.min(500, ms + 20); restart(); }
});
