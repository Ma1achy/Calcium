// C22 I113 and C17 I27 — where a chip previews (§101).
//
// **A projection has no key, so nothing about it is visible in a keymap.** It
// is right or wrong only in the frames it produces, and each of these attacks a
// clause the panel would still be drawn without: which chip it names, whether
// it survives the caret leaving, whether it defers to a layer that owns the
// region, and whether it takes the keys that move the caret it is derived from.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONSTRUCT = "src/shell/construct.ts";
const EDITOR = "src/interaction/editor/editor.ts";
const FILES = "test/unit/chip-preview.test.ts test/unit/chip-form.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): with the projection
    // never finding a chip, no panel is ever pushed and every positive arm
    // fails. If this survives, nothing below reaches a frame.
    file: CONSTRUCT,
    from: "    const chip = focus.current.at === \"prompt\" ? stores.editor.chipAt() : null;",
    to: "    const chip = null;",
    why:
      "no preview is ever pushed, so the panel arms and the caret-walk arms are all "
      + "the empty frame — if this survives, the rows are not reading the frames they think they are",
  },
  mutations: [
    {
      // **THE DEFECT: the preview outlives the caret.** A projection that is
      // pushed and never dismissed is a layer that was opened, and the whole
      // of §101's *focus decides which* is that it is not. Nothing about the
      // panel's own content would show it.
      name: "THE DEFECT: the preview is not dismissed when the caret leaves the chip",
      file: CONSTRUCT,
      from: "      previewed = null;\n      if (have) stores.overlays.dismiss(CHIP_PREVIEW_ID);\n      return;",
      to: "      previewed = null;\n      return;",
      expect: "T1.69",
    },
    {
      // **The guard that defers to whatever owns the region.** Removed, the
      // preview pushes itself under a search — C15 places every layer, so it is
      // still drawn, which is why the row reads the frame rather than the top.
      name: "the preview pushes itself beneath a layer that owns the region",
      file: CONSTRUCT,
      from: "    const blocked = stores.overlays.stack.some((l) => l.id !== CHIP_PREVIEW_ID);",
      to: "    const blocked = false;",
      expect: "T1.70",
    },
    {
      // **Focus read as the router's target.** The measured defect this clause
      // exists for: the preview's own layer raises the `panel` rung, so a
      // projection asking the router dismisses itself on the next key.
      name: "focus is read from the router's target, which the preview's own layer moves",
      file: CONSTRUCT,
      from: "    const chip = focus.current.at === \"prompt\" ? stores.editor.chipAt() : null;",
      to: "    const chip = router.target === \"prompt\" ? stores.editor.chipAt() : null;",
      expect: "T1.69",
    },
    {
      // **The prompt's precedence under the preview.** Without it the panel
      // takes the keys that move the caret it is derived from, so typing
      // reaches no handler and the caret can never leave the chip.
      name: "the preview answers keys rather than letting the prompt answer beneath it",
      file: CONSTRUCT,
      from: "    stores.overlays.top?.id === CHIP_PREVIEW_ID ||\n",
      to: "",
      expect: "T1.69",
    },
    {
      // **The chip nearest the caret, backwards first.** Forwards only, and the
      // chip just pasted never previews — the caret is left past it, which is
      // the one position a reader arrives at without moving.
      name: "only the chip after the caret is read, so a pasted chip never previews",
      file: EDITOR,
      from: "    return this.#chips.get(before) ?? this.#chips.get(after) ?? null;",
      to: "    return this.#chips.get(after) ?? null;",
      expect: "T1.48",
    },
    {
      // **And backwards only**, which loses the head of the buffer — the one
      // position `home` lands on, where there is nothing before the caret.
      name: "only the chip before the caret is read, so the head of the buffer answers nothing",
      file: EDITOR,
      from: "    return this.#chips.get(before) ?? this.#chips.get(after) ?? null;",
      to: "    return this.#chips.get(before) ?? null;",
      expect: "T1.48",
    },
    {
      // **The panel's title is the chip's own label.** Composed from a literal
      // instead, two chips spell the same and the prompt's inline label and the
      // panel's header part company — C17 I25's *never supplied as a string*.
      name: "the panel's title is a literal rather than the chip's composed label",
      file: CONSTRUCT,
      from: "      title: chipLabel(chip, chipLook),",
      to: "      title: \"Chip\",",
      expect: "T1.69",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
