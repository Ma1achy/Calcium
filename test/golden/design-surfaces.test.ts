// Golden frames for the corpus's third axis — one per **design fixture** (M16).
//
// **The axis the other two cannot be.** `blocks.test.ts` is indexed by kind and
// `states.test.ts` by state, both of them the repo's own vocabulary; a surface
// can have a kind, have a state, and still not look like the fixture that
// specifies it. This file is indexed by the design's sections, so a frame here
// is the picture a reader compares against `docs/design/language/fixtures/`.
//
// **Three rungs, and the third is not padding.** The first draft took two —
// the arm the fixtures are drawn at, and the one that has to survive without
// Unicode — on the argument that what these frames are for is the shape. §030
// is what added the third. M4 ruled the head mark **by whether tone carries**,
// so `mono-unicode` is the rung where the glyph moves while the alphabet does
// not, and neither of the other two can show it: at 24-bit colour every state
// draws one mark, at ASCII the whole alphabet has stepped down. A ladder whose
// middle rung is never drawn is a ladder nothing checks.
import { describe, expect, it } from "vitest";

import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS } from "../support/render.js";
import { SURFACES } from "../support/design-surfaces.js";

const WIDTHS = [40, 80] as const;

const VARIANTS = [
  { name: "dark-unicode", theme: DARK_THEME, capabilities: FULL_CAPS },
  { name: "dark-mono-unicode", theme: DARK_THEME, capabilities: MONO_UNICODE_CAPS },
  { name: "dark-ascii", theme: DARK_THEME, capabilities: ASCII_CAPS },
] as const;

describe("golden frames — one per design fixture", () => {
  for (const variant of VARIANTS) {
    for (const width of WIDTHS) {
      it(`${variant.name} at ${String(width)}`, () => {
        const frame = SURFACES.map((s) => {
          const rows = s.rows(width, variant.capabilities, variant.theme);
          // Stripped of SGR, as the other lines corpora are: these frames are
          // about *what is drawn*, and C10's own goldens own colour. A snapshot
          // carrying both changes when either does, and then neither is
          // protected.
          //
          // **The escape byte is part of the sequence**, and the first draft's
          // pattern began at the `[` — so every painted row kept a bare U+001B
          // at each end and the snapshot held control bytes a reader cannot
          // see. It passed, because a frame nobody paints has none: the first
          // six surfaces drew no ink at all. §021's bar is painted, and its
          // residue row did not even sort where it reads.
          return [`── §${String(s.section)} · ${s.name}`, ...rows]
            .map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""))
            .join("\n");
        }).join("\n");
        expect(frame).toMatchSnapshot();
      });
    }
  }
});
