// C16 I49 — the captured child, mutated.
//
// **Every mutation here leaves a session that looks attached and is not
// captured**, which is the whole failure mode: the border says *your keys go to
// the child* and some of them do not. Three of the four are silent — a letter
// reaches an editor nobody can see, an escape the legend names does nothing, a
// surface declares a chord it will never be handed — and the fourth is the
// decoder's, where the key the design chose *because* every terminal sends it
// arrives with no name.
//
// The control is the line as it shipped before M9: `attachedChild` from
// `inFlight()` alone. Restored, an attached child leaves the target at `prompt`
// and the whole rung is unreachable — a run that cannot see that cannot see
// anything below it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/surface.test.ts test/unit/session-keys.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/interaction/router/router.ts",
    from: '      attachedChild: deps.inFlight() === "shell" || deps.childAttached(),\n',
    to: '      attachedChild: deps.inFlight() === "shell",\n',
    why: "the shipped line before M9 knew one source of capture — a surface attaches and the ladder still answers `prompt`, so every row below is asserting against a rung nothing reaches",
  },
  mutations: [
    // **The child's handler stops consuming what it does not bind — retired
    // 2026-09-28 (review batch 3, b3-mut), and the wrapper with it.** The
    // comment here said *the wrapper is the whole of it*, and it stopped being
    // true at ruling 62, when the router's own `child` rung began consuming
    // whatever no handler at it took, for both sources. From then the mutation
    // was a change with no effect: it survived T1.106 and every other row in
    // the set. Measured before deleting anything:
    //
    //   rung removed, wrapper kept   T4.84 fails (a shell delegation has no handler)
    //   both removed                 T1.106 and T4.84 fail
    //   wrapper removed alone        nothing fails
    //
    // So the survivor indicted the code, not T1.106: a second carrier no row
    // could tell from the first. The one event the two treated differently is a
    // key release, which C16 I65's branch drops rather than consumes, and no rung
    // below `child` is offered a release either way. The registration is now
    // `onInput` alone, and the rung is held by the mutation below.
    {
      // **The rung, which is now the only carrier** (C16 I49, ruling 62).
      // Without it an unbound key at an attached surface passes the `child`
      // rung and falls to `global`: `F1` submits `/help keys` behind the child.
      // `c16-ownership` mutates the same line for the delegation source and
      // expects T4.84; this one is the surface source, which T1.106 reads.
      name: "the child rung stops consuming what no handler at it takes",
      file: "src/interaction/router/router.ts",
      from: "    if (target === \"child\") {\n      stages.push(\"child:consumed\");\n      return true;\n    }\n",
      to: "",
      expect: "T1.106",
    },
    // **`first: true` restored — retired 2026-09-28 (review batch 3, M9 item
    // 4).** It put the consuming wrapper in front of the host's own `child`
    // handler, so the escape was swallowed by the thing it is meant to escape.
    // C16 I75 moved the escape into the intercept table, read before any
    // handler at the rung, so the mutation is now a change with no effect —
    // the property I75 exists to give. `c16-host-detach` holds the order
    // instead: T4.94 registers its consumer `first: true` on purpose, and its
    // control removes the intercept.
    {
      // *May never leave capture without a visible, reachable host escape.*
      // Without the collision test the attach succeeds and the application's
      // binding is simply never delivered — the refusal is the only moment at
      // which anyone could be told.
      name: "the reservation is unenforced — a surface binding the host escape attaches",
      file: "src/shell/surface.ts",
      from: "    for (const chord of options.reservedChords()) {\n      if (!bindings.has(chordKey(chord))) continue;\n",
      to: "    for (const chord of options.reservedChords()) {\n      if (!bindings.has(chordKey(chord))) continue;\n      if (chord.name !== \"\\u0000\") continue;\n",
      expect: "T1.107",
    },
    {
      // C16 I56 — the exit arm reads the same fact the rung does. Without the
      // clause a surface leaves focus at an empty prompt, so the second `⌃c`
      // inside the window raises the host's confirm and the child never sees it.
      name: "the exit arm ignores an attached child",
      file: "src/interaction/router/router.ts",
      from: "      deps.liveStreams() === 0 &&\n      !deps.childAttached()\n",
      to: "      deps.liveStreams() === 0\n",
      expect: "T1.106c",
    },
    // **C22 I110's three, and the first is what the earlier take of this run
    // could not reach.** The wrapper's mutation survived until the layer went:
    // `blocking: true` on the pushed view was consuming every unbound key at
    // `dispatchInner`'s modal branch, so the consuming turn was covered twice
    // and the row could not tell which carrier it was reading. That is the
    // measured case for landing both halves of I110 before taking the pass.
    {
      name: "the entry is re-appended per render rather than replaced in place",
      file: "src/shell/construct.ts",
      from: "          entryId,\n",
      to: "          stores.transcript.append(compose({ command: `child ${id}`, blocks: [childBlock(id, blocks)] })),\n",
      expect: "T4.94",
    },
    {
      // The border's legend dropped. The footer still says it, which is exactly
      // the state I110 calls *either alone leaves a reader with no way out* —
      // and it is invisible to anyone reading the frame at the prompt.
      name: "the entry's border loses the host escape — one carrier, not two",
      file: "src/shell/construct.ts",
      from: "      footer: childBorderLegend(detection.capabilities),\n",
      to: "",
      expect: "T4.94b",
    },
    {
      // The detach sweeps the entry. This is the pushed view's hole arriving
      // under the new mechanism, and the frame after a detach looks tidy.
      name: "the detach empties the entry — a hole where the capture was",
      file: "src/shell/surface.ts",
      from: "      resizeDisposable[Symbol.dispose]();\n",
      to: "      resizeDisposable[Symbol.dispose]();\n      options.entry.replace(entryId, surface.id, []);\n",
      expect: "T4.94",
    },
    {
      // The decoder's arm, and the defect it replaced was not that `⌃]` did the
      // wrong thing — it was that `0x1d` arrived named by its own control byte
      // and no keymap row could ever match it.
      name: "the C0 separators lose their names — `⌃]` arrives as `0x1d`",
      file: "src/interaction/router/decode.ts",
      from: "      if (code >= 28 && code <= 31) {\n        return out.push(key(String.fromCharCode(code + 64), ch, { ctrl: true })), 1;\n      }\n",
      to: "",
      expect: "T1.106b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
