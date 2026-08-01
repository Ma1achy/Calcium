// C10 tier 4 — integration.
//
// C09 landed, so the three that waited on a renderer are written. What\n// remains waits on L4. Each deferral
// names its blocker in the greppable form, so `tools/enforce/todo-expiry.mjs`
// fails the day the blocker lands rather than the day someone remembers.
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { caps, store, TONES } from "../support/theme.js";
import { block } from "../../src/data/viewmodel/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import {
  DARK_THEME,
  FULL_CAPS,
  LIGHT_THEME,
  MONO_CAPS,
  measurable,
  visible,
} from "../support/render.js";

describe("C10 integration", () => {
  it("T4.1 (with C09): the same block in both variants produces identical row counts", () => {
    // A theme is colour, and colour is never geometry (C04 §5). This is the
    // assertion that lets C14 keep a measured height across `/theme light`.
    const dark = measurable({ theme: DARK_THEME });
    const light = measurable({ theme: LIGHT_THEME });

    for (const fixture of Object.values(ONE_PER_KIND)) {
      for (const width of [40, 80, 120]) {
        expect(light.measure(fixture, width), `${fixture.kind} at ${width}`).toBe(
          dark.measure(fixture, width),
        );
        expect(
          light.renderToLines(fixture, width).length,
          `${fixture.kind} at ${width}`,
        ).toBe(dark.renderToLines(fixture, width).length);
      }
    }
  });

  it("T4.2 (with C09, C02): at depth 1 a status row stays distinguishable by glyph alone", () => {
    // D29's promise, checked from the other end. C10 collapses ten tones onto
    // three typographic classes at 1-bit; what makes that safe is that no
    // information was in the colour to begin with.
    const steps = block({
      kind: "steps",
      id: "theme-mono",
      steps: [
        { label: "resolve", state: "done" },
        { label: "build", state: "failed" },
        { label: "push", state: "pending" },
      ],
    });

    const lines = measurable({ capabilities: MONO_CAPS }).renderToLines(steps, 40).map(visible);

    expect(new Set(lines.map((line) => [...line][0])).size, "three states, three glyphs").toBe(3);
    for (const line of lines) {
      expect(line.includes(String.fromCharCode(27)), "no colour at 1-bit").toBe(false);
    }
  });

  it("T4.3 (with C09): at depth 4, ok/warn/error render as three distinct ANSI colours", () => {
    const kit = measurable({ capabilities: { ...FULL_CAPS, colourDepth: 4 } });
    const sequences = (["ok", "warn", "error"] as const).map((tone) => {
      const line =
        kit.renderToLines(
          block({ kind: "notice", id: `theme-${tone}`, tone, glyph: "running", text: "state" }),
          40,
        )[0] ?? "";
      return line.slice(0, line.indexOf("m") + 1);
    });

    expect(new Set(sequences).size, "three tones must not collapse onto one green").toBe(3);
    for (const sequence of sequences) {
      expect(sequence, "a four-bit terminal gets 30–37 / 90–97").not.toContain("38;");
    }
  });

  it("T4.4 (with C03, C23): a theme switch makes L4 call invalidate, and C10 never does", async () => {
    // **A02 Seam 4's theme row, from C10's side.** `theme.setVariant` →
    // `scheduler.invalidate`, and the invalidate is L4's: a theme store that
    // committed its own frame would be L1 reaching into L0.
    //
    // Asserted as *both halves* — that L4 invalidated, and that switching the
    // variant directly does not. Either alone passes on an implementation where
    // C10 invalidates and C23 does too, which is the two-owners defect Seam 4
    // exists to prevent.
    const h = pipelineHarness();
    const before = h.theme.current.tokens.variant;

    h.pipeline.submit("/theme light");
    await settled();

    expect(h.theme.current.tokens.variant, "C10 switched").toBe("light");
    expect(h.calls, "and L4 invalidated").toContain("invalidate");
    expect(before, "the fixture started somewhere else, so the switch did something").not.toBe(
      "light",
    );

    // C10's own path, with no L4 in it.
    const direct = pipelineHarness();
    direct.theme.setVariant("light");
    expect(direct.calls, "C10 never invalidates").not.toContain("invalidate");
  });
  it.todo("T4.5: /theme light persists to config and survives a restart — waits on C22 — theme persistence is unowned and unbuilt (C22 §2); nothing in the tree writes a theme choice to disk");
  it.todo("T4.6: a corrupt override in config → base theme retained, notice committed — waits on C22 — the same unowned feature as T4.5; there is no config to corrupt");

  it("(with C02): a detected capability record drives the ladder end to end", () => {
    // The half of T4.3 that does not need a renderer: C02 decides the depth from
    // the environment, C10 obeys it, and neither knows the other's rules.
    const dumb = detectCapabilities({ TERM: "dumb" }).capabilities;
    const truecolour = detectCapabilities({ TERM: "xterm-256color", COLORTERM: "truecolor" }).capabilities;

    expect(dumb.colourDepth).toBe(1);
    expect(truecolour.colourDepth).toBe(24);

    const current = store().current;
    for (const tone of TONES) {
      expect(resolveTone(tone, current, dumb).colour, `${tone} on TERM=dumb`).toBeUndefined();
      expect(resolveTone(tone, current, truecolour).colour?.kind).toBe("rgb");
    }
  });

  it("(with C02): the record is injected, never read — C10 works off a hand-built one", () => {
    // I12. A fabricated record with no environment behind it resolves exactly as
    // a detected one does, which is what "injected" has to mean to be worth
    // asserting.
    const current = store().current;
    expect(resolveTone("ok", current, caps(4))).toEqual(
      resolveTone("ok", current, { ...detectCapabilities({ TERM: "xterm" }).capabilities, colourDepth: 4 }),
    );
  });
});
