// A chord's display notation, mutated — the glyphs, the capitalisation and the
// split from the slot.
//
// **Why a run rather than trust in one equality row.** T1.98 compares
// `chordText` against the registry's own `chord` for all 41 registry bindings,
// which is a strong row and is blind in one direction: it says nothing about
// the 80 bindings the registry does not name, and nothing about the split
// itself. A tree where `chordText` simply *is* `keySlot` fails 41 rows loudly;
// a tree where the ASCII arm quietly returns the glyphs fails none of them, and
// that is the arm the whole `MARK_EXEMPTIONS` entry rests on.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/router-keymap.test.ts test/unit/keymap-table.test.ts";
const K = "src/interaction/router/keymap.ts";

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
    file: K,
    from: '  enter: "⏎",',
    to: '  enter: "⌤",',
    why: "one glyph of eleven, and the registry names this one in binding.001 — a run where it survives is not comparing the notation against the design at all",
  },
  mutations: [
    {
      // **The ASCII arm returns the glyphs.** Every registry comparison still
      // passes, `docs/KEYS.md` is unchanged, and the only thing that breaks is
      // the premise the SS47 exemption is written on — which is exactly the
      // failure an exemption inherited rather than re-checked would hide.
      name: "the ASCII rung carries the chord glyphs",
      file: K,
      from: "  if (!unicode) return chordName(key);",
      to: "  // the rung is gone",
      expect: "T1.98",
    },
    {
      // **A letter is capitalised under `⌥` too.** `⌥p` becomes `⌥P`, which the
      // registry names in the posture binding and nothing else in the tree
      // would notice.
      name: "a meta-only letter is capitalised, so `⌥p` becomes `⌥P`",
      file: K,
      from: "key.name.length === 1 && (key.ctrl === true || shift) ? key.name.toUpperCase() : key.name; // graphemes-ok",
      to: "key.name.length === 1 ? key.name.toUpperCase() : key.name; // graphemes-ok",
      expect: "T1.98",
    },
    {
      // **The capital stops carrying the shift.** `m+C` renders `⌥C` instead of
      // `⌥⇧C`, which is the registry's `selection.native` — the arm that exists
      // because a terminal sends the capital and there is no separate bit.
      name: "a capital in the name no longer renders `⇧`",
      file: K,
      from: "  const shift = key.shift === true || capital;",
      to: "  const shift = key.shift === true;",
      expect: "T1.98",
    },
    {
      // **The split undone.** The display becomes the identity again, which is
      // the state clause 6 was written to end.
      name: "`chordText` is `keySlot` under another name",
      file: K,
      from: "  if (!unicode) return chordName(key);",
      to: "  return keySlot(key);",
      expect: "T1.98",
    },
    {
      // **And the other direction: the identity becomes the display.** A slot
      // spelled in glyphs still separates every chord this keymap holds, so the
      // duplicate check stays correct and the `KEYS.md` table stops agreeing
      // with the set the ladder marks.
      name: "`slot` compares the chord instead of the shorthand",
      file: K,
      from: "  return `${target} ${keySlot(key)}`;",
      to: "  return `${target} ${chordText(key)}`;",
      expect: "T1.99",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
