// Entry 45, the shape half — the setting, the record, and the resolution.
//
// **Two of these cannot be seen by looking at a cursor**, which is why the rows
// they must reach count bytes rather than read a frame:
//
//   - the style emitted on every frame instead of on change. Correct on every
//     individual frame, wrong as a stream, and at frame cadence against a
//     spinner's 80 ms.
//   - a target that declares nothing resolving to a default shape. Every visual
//     check passes and a terminal the application never asked to touch has been
//     changed.
//
// And one is reachable only through a handoff: `resume()` not clearing the
// record, which is **the state the emit-on-change ruling created** — the child
// overwrote the cursor, C01's record says *already emitted*, so the next frame
// emits nothing and the bar stays.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/lifecycle.test.ts test/unit/cursor-style.test.ts " +
  "test/unit/session-composite.test.ts test/unit/session-paint.test.ts " +
  "test/unit/session-construct.test.ts";
const LIFECYCLE = "src/terminal/lifecycle.ts";
const FRAME = "src/shell/render-frame.ts";
const SESSION = "src/shell/session.ts";
const STYLE = "src/shell/cursor-style.ts";
const ESCAPES = "src/terminal/escapes.ts";
const CONSTRUCT = "src/shell/construct.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **Emit-on-change dropped.** The defect that would have shipped: the shape
    // rides `cursorSequence`'s write, which goes out with every frame.
    name: "the shape is emitted on every frame",
    file: LIFECYCLE,
    from: "    if (shapeEmitted !== undefined && sameStyle(shapeEmitted, style)) return \"\";",
    to: "",
    expect: "T1.25",
  },
  {
    // **The three-state record collapsed to two.** *Nothing emitted* becomes
    // *the default emitted*, so an application that declares no style writes a
    // reset into a terminal it never touched — and every visual check passes,
    // because the terminal's default is usually what was already there.
    name: "an undeclared style emits the reset before anything was set",
    file: LIFECYCLE,
    from: "    if (style === null && shapeEmitted === undefined) return \"\";\n",
    to: "",
    expect: "T1.26",
  },
  {
    // **`resume()` trusting the record**, which is the state emit-on-change
    // created and is reachable only through a handoff.
    //
    // **Its first version mutated the walk's ruling — `shapeEmitted = undefined`
    // — and survived**, which turned out to indict the ruling rather than the
    // test: clearing the record restores the *leave the terminal alone* arm, so
    // a target resolving to `null` after a handoff emits nothing and the
    // child's bar stays. It was dead as well, because `suspend()` already
    // resets and every request for a real style re-emitted either way.
    name: "resume keeps the record across a handoff",
    file: LIFECYCLE,
    from: "    shapeUnknown = true;\n    state = \"constructed\";",
    to: "    state = \"constructed\";",
    expect: "T1.27",
  },
  {
    // **The unknown record honoured for a real style but not for the reset** —
    // the shape the walk's ruling actually had, written out. Only a request for
    // *the terminal's own* tells the two apart.
    name: "an unknown record skips the reset",
    file: LIFECYCLE,
    from: "      shapeUnknown = false;\n      shapeEmitted = style;\n      return style === null ? CURSOR_SHAPE.reset : CURSOR_SHAPE.set(style);",
    to: "      shapeUnknown = false;\n      shapeEmitted = undefined;",
    expect: "T1.27",
  },
  {
    // **The reset at release made unconditional.** Satisfies the arm that says
    // a set shape is given back and breaks the one that says an unset one is
    // left alone — which is why both arms exist.
    name: "release resets unconditionally",
    file: LIFECYCLE,
    from: "    if (shapeEmitted === undefined || shapeEmitted === null) return \"\";",
    to: "    if (false) return \"\";",
    expect: "T1.26",
  },
  {
    // **`??` instead of a key test.** A declared `null` means *leave this
    // target's cursor alone* and would fall through to the fallback — the two
    // are the whole of what a per-target override is for, and `??` conflates
    // them.
    name: "a declared null falls through to the fallback",
    file: STYLE,
    from: "  if (targets !== undefined && target in targets) return targets[target] ?? null;",
    to: "  if (targets?.[target] != null) return targets[target];",
    expect: "T1.22",
  },
  {
    // **The fallback ignored**, so only declared targets get a style. Passes
    // every single-target case.
    name: "no fallback for an undeclared target",
    file: STYLE,
    from: "  return config?.fallback ?? null;",
    to: "  return null;",
    expect: "T1.22",
  },
  {
    // **The blink edge firing on a target whose style is `null`** — the
    // boundary the shape half already ruled, and the state machine is a second
    // way for it to go wrong. Inventing a shape so that *steady* is expressible
    // changes a terminal the application never asked to touch, and every visual
    // check passes because the shape chosen is a plausible one.
    name: "the machine invents a shape for an undeclared target",
    file: STYLE,
    from: "  if (style === null || !style.blink) return style;",
    to: "  if (style === null) return idle ? { shape: \"block\", blink: true } : { shape: \"block\", blink: false };\n  if (!style.blink) return style;",
    expect: "T1.22e",
  },
  {
    // **The machine adding blink as well as removing it.** *Idle means
    // blinking*, whatever was declared — so the declaration stops being the
    // app's answer and becomes a hint.
    name: "idle makes a steady style blink",
    file: STYLE,
    from: "  if (style === null || !style.blink) return style;\n  return idle ? style : { shape: style.shape, blink: false };",
    to: "  if (style === null) return style;\n  return { shape: style.shape, blink: idle };",
    expect: "T1.22e",
  },
  {
    // **The idle wake armed unconditionally**, which is the spinner's rule
    // applied where its argument does not hold: the spinner's wake follows a
    // request, and this one follows every keystroke.
    name: "the idle wake is armed whatever is declared",
    file: CONSTRUCT,
    from: "      if (!blinks) return;\n",
    to: "",
    expect: "T1.22f",
  },
  {
    // **The previous wake left armed.** A burst of keys then arms a burst of
    // live wakes and every one of them draws.
    //
    // **This row replaced a generation guard the pass found dead.** The
    // spinner's shape — `seq += 1`, `if (mine === seq)` — was copied here, and
    // it can never fire, because `schedule`'s disposable calls `clearTimeout`.
    // The spinner's is live for the reason this one was not: it arms without
    // cancelling.
    name: "the previous idle wake is left armed",
    file: CONSTRUCT,
    from: "      blinkWake?.[Symbol.dispose]();\n      blinkWake = config.schedule(",
    to: "      blinkWake = config.schedule(",
    expect: "T1.22g",
  },
  {
    // **The stamp dropped**, so the cursor is idle from the first frame and
    // never returns to steady.
    name: "input does not reset the idle clock",
    file: CONSTRUCT,
    from: "      lastInputAt = config.clock();\n      if (!blinks) return;",
    to: "      if (!blinks) return;",
    expect: "T1.22h",
  },
  {
    // **The wiring, not the mechanism.** Every row above calls the seam
    // directly, and a seam-level row passes on the day nothing calls it — so
    // the call site is mutated rather than the function.
    name: "the frame does not carry the shape",
    file: FRAME,
    from: "    write: `${deps.cursorShape()}${hide}${body(lines, deps)}${deps.cursorSequence(cursor)}`,",
    to: "    write: `${hide}${body(lines, deps)}${deps.cursorSequence(cursor)}`,",
    expect: "T1.22d",
  },
  {
    // **The resolution wired to the wrong question.** `promptFocused` is about
    // *position*; the target is what holds the keys. A layer with no cursor of
    // its own falls through to the prompt's position, and giving it the
    // prompt's shape too is the cell §6f table row 5 rules on.
    name: "the style is resolved from the prompt rather than from the target",
    file: SESSION,
    from: "          cursorStyleFor(graph.router.target, this.config.cursor),",
    to: "          cursorStyleFor(\"prompt\", this.config.cursor),",
    expect: "T1.22d",
  },
  {
    // **Blink dropped from the parameter**, which is the shape-and-blink-are-one
    // fact. The style still resolves, the shape is still right, and the wire
    // says steady for both.
    name: "blink is not part of the wire parameter",
    file: ESCAPES,
    from: "    `\\x1b[${String(SHAPE_CODE[style.shape][style.blink ? 1 : 0])} q`,",
    to: "    `\\x1b[${String(SHAPE_CODE[style.shape][0])} q`,",
    expect: "T1.22c",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * The pass fails if a listed mutation is caught after all, so an entry cannot
 * outlive its reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "the style is resolved from the prompt rather than from the target",
    "**the argument `session.ts` passes, and no harness in tiers 1–4 runs that line.** T1.22d " +
      "reaches the *frame's* wiring by driving `composeFrame` with a stand-in `cursorShape`, " +
      "which is what catches the shape being dropped from the write — but the resolution's " +
      "argument is chosen one layer up, inside a private method of a session nothing " +
      "constructs outside `createTui`. **This is the gap T1.22d exists because of, one level " +
      "further out**: a seam-level row passes on the day nothing calls the seam, and a " +
      "frame-level row passes on the day the session calls it with the wrong argument. What " +
      "would close it is a full-session harness or a tier-5 row reading the bytes with an " +
      "overlay focused, and neither is written; recorded rather than left as a silent pass. " +
      "**Re-stated by the blink half rather than closed**: that step wrapped the call — " +
      "`steadyWhileTyping(cursorStyleFor(target, …), idle)` — and left the argument exactly " +
      "where it was, so the gap is unchanged and this reason is still the whole of it",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: LIFECYCLE,
    from: "  function cursorShapeSequence(style: CursorStyle | null): string {",
    to: "  function cursorShapeSequence(_style: CursorStyle | null): string {\n    throw new Error(`control`);\n  }\n  function unusedCursorShapeSequence(style: CursorStyle | null): string {",
    why:
      "the shape refuses to be produced at all — if this survives, nothing in the set reaches " +
      "C01's seam and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
