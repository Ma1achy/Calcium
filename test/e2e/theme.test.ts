// C10 tier 5 — e2e. Every one of these needs a rendered frame, and every one of
// them has one: the union rows render through the registry, and the session
// rows drive `node test/support/fixture.mjs session` through a real PTY. The
// header read *waits on the renderer that produces it* until 2026-09-03.
import { describe, expect, it } from "vitest";
import { ALL_KINDS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable, visible } from "../support/render.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells } from "../../src/presentation/text.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { interactivePty, promptRow, type InteractivePty } from "../support/pty.js";

const DEPTHS = [24, 8, 4, 1] as const;
const VARIANTS = [
  { name: "dark", theme: DARK_THEME },
  { name: "light", theme: LIGHT_THEME },
] as const;

const ALL_THREE = [
  tableDefinition as unknown as BlockDefinition<never>,
  plotDefinition as unknown as BlockDefinition<never>,
  patchDefinition as unknown as BlockDefinition<never>,
];

describe("C10 e2e", () => {
  // C09's fourteen have had golden frames since C09 — `test/golden/blocks.test.ts`,
  // four widths × both variants × both unicode modes. What was deferred here was the
  // *whole* union: `table`, `plot` and `patch` are registered by C11, C12 and C25,
  // so "every block kind" could not be honest until the last of them existed.
  //
  // **It exists now.** C11 and C12 have their own goldens and C25's are at
  // `test/golden/patch.test.ts`; this is the vocabulary in one frame, which is a
  // different claim from any of them — that the eighteen render *together*, in both
  // variants, at all four depths, without one of them throwing on a capability the
  // others tolerate.
  it("T5.1: every block kind renders in both variants at all four depths", () => {
    const failures: string[] = [];

    for (const variant of VARIANTS) {
      for (const depth of DEPTHS) {
        const kit = measurable({
          definitions: ALL_THREE,
          theme: variant.theme,
          capabilities: { ...FULL_CAPS, colourDepth: depth },
        });

        // **A literal here went stale and this tier is where it hid.** `scroll`
        // landed, the comment above was swept to *the eighteen* and the number
        // in the assertion was not — and `npm test` excludes tier 5, so six
        // green targets said nothing for five commits.
        //
        // Derived now, and as a **set equality** rather than a count: the row's
        // sentence is *the whole vocabulary is present*, and two lists of the
        // same length can still disagree about which kinds they hold. It cannot
        // go stale in either direction — a kind registered and absent from the
        // corpus fails, and so does the converse.
        expect(
          [...kit.kinds].sort(),
          "the whole vocabulary must be present, and it is the corpus's own list",
        ).toEqual([...ALL_KINDS].sort());

        for (const kind of ALL_KINDS) {
          const block = ONE_PER_KIND[kind];
          const where = `${variant.name} depth ${String(depth)} ${kind}`;

          try {
            const rendered = kit.renderToLines(block, 100);
            const measured = kit.measure(block, 100);
            if (rendered.length !== measured) {
              failures.push(`${where}: measured ${String(measured)}, drew ${String(rendered.length)}`); // cells-ok
            }
            for (const row of rendered) {
              if (cells(visible(row)) > 100) failures.push(`${where}: a row over its width`);
            }
          } catch (error) {
            failures.push(`${where}: threw ${String(error)}`);
          }
        }
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T5.1a (D29): at depth 1 no kind emits a colour, and every one still renders", () => {
    // The other half of the union claim, and the one D29 rests on. A kind that
    // carried its meaning in colour would be indistinguishable here from one that
    // carried it in a glyph — until a reader on a monochrome terminal could not tell
    // a failure from a success.
    for (const mode of [FULL_CAPS, ASCII_CAPS]) {
      const kit = measurable({
        definitions: ALL_THREE,
        capabilities: { ...mode, colourDepth: 1 },
      });

      for (const kind of ALL_KINDS) {
        for (const row of kit.renderToLines(ONE_PER_KIND[kind], 100)) {
          expect(/\[[0-9;]*(?:38;|48;|3[0-7]m|4[0-7]m|9[0-7]m|10[0-7]m)/.test(row), `${kind} at one bit`).toBe(
            false,
          );
        }
      }
    }
  });

  // **The environment is the input**, which is what makes these three e2e rows
  // rather than contract ones: C02 reads `TERM` in exactly one place and every
  // depth decision below follows from it, so a session under a different `TERM`
  // is the only way to drive the whole chain from outside.
  const session = (term: string): InteractivePty =>
    interactivePty("node test/support/fixture.mjs session", {
      cols: 100,
      rows: 24,
      env: { TERM: term },
    });

  /** Every SGR in what the terminal received. */
  const sgrs = (out: string): string[] => [...out.matchAll(/\u001b\[([0-9;]*)m/g)].map((m) => m[1] ?? "");

  it("T5.2: a real session under TERM=xterm emits no truecolour escapes", async () => {
    const pty = session("xterm");
    try {
      await pty.waitFor(/❯/, 15_000);
      // Something themed on the screen, rather than an empty frame: the header
      // carries the name and the clock, and a frame that rendered nothing would
      // satisfy "no truecolour" perfectly.
      await pty.waitFor(/widget/, 15_000);

      const emitted = sgrs(pty.output);
      expect(emitted.length, "the fixture emits colour at all").toBeGreaterThan(0);
      // `38;2;r;g;b` is truecolour, `38;5;n` is the 256-colour form, and plain
      // `TERM=xterm` with no `COLORTERM` is **4-bit** — so neither extended
      // form may appear and the basic range must. The last clause is the
      // control: a session that emitted no colour at all satisfies the two
      // absences perfectly.
      expect(emitted.filter((p) => p.startsWith("38;2")), "no truecolour at xterm").toEqual([]);
      expect(emitted.filter((p) => p.startsWith("38;5")), "and no 256-colour either").toEqual([]);
      expect(
        emitted.some((p) => /^(3[0-7]|9[0-7])$/.test(p)),
        "but the 4-bit range is used",
      ).toBe(true);
    } finally {
      pty.kill();
    }
  }, 40_000);

  // **The deferral was right about detection and wrong about the session.**
  // `TERM=dumb` is the only *detected* route to depth 1 and it fails C01's
  // alternate-screen gate, so a 1-bit session cannot be reached through the
  // environment — that half stands. What it missed is that detection is not the
  // only producer: `TuiConfig.capabilities` is C22 I49's override, validated by
  // C02 (`colourDepth: oneOf(1, 4, 8, 24)`), and it exists precisely for the
  // terminal that can host a session and whose user wants no colour. The
  // fixture hands it `FORCE_DEPTH`, the variable its `caps` mode already read.
  it("T5.3 (C22 I49, C02 I4, C10 I2): a session forced to depth 1 emits no colour at all — and the same session detected does", async () => {
    const colour = (params: readonly string[]): string[] =>
      params.filter((p) => /^(3[0-7]|9[0-7]|4[0-7]|10[0-7]|38;.*|48;.*)$/.test(p));

    const mono = interactivePty("node test/support/fixture.mjs session", {
      cols: 100,
      rows: 24,
      env: { TERM: "xterm-256color", FORCE_DEPTH: "1" },
    });
    try {
      await mono.waitFor(/❯/, 15_000);
      // Toned content on the screen, not only the header: a table whose cells
      // carry `ok`/`error` tones is the kind that would emit colour if any did.
      mono.type("/ps --mine\r");
      await mono.waitFor(/a3f9b21/, 15_000);
      const emitted = sgrs(mono.output);
      expect(emitted.length, "the session styles at all — dim and reset are still SGRs").toBeGreaterThan(0);
      expect(colour(emitted), "no colour parameter at depth 1").toEqual([]);
      // Distinct without colour: the table still reads.
      expect(mono.frame.join("\n")).toContain("failed");
    } finally {
      mono.kill();
    }

    // **The control — the same terminal, detected.** Without the override the
    // same frames carry colour, so the absence above is the override's doing
    // and not a session that emitted nothing.
    const detected = session("xterm-256color");
    try {
      await detected.waitFor(/❯/, 15_000);
      detected.type("/ps --mine\r");
      await detected.waitFor(/a3f9b21/, 15_000);
      expect(colour(sgrs(detected.output)).length, "the detected session is coloured").toBeGreaterThan(0);
    } finally {
      detected.kill();
    }
  }, 60_000);

  it("T5.4: /theme toggled fifty times mid-session leaves no half-themed frame", async () => {
    const pty = session("xterm-256color");
    try {
      await pty.waitFor(/❯/, 15_000);

      // **`/theme` takes a required `variant`** (C05's framework manifest), so
      // a bare `/theme` is a validation refusal rather than a toggle — which is
      // what the first draft of this row typed fifty times.
      for (let i = 0; i < 50; i += 1) {
        pty.type(`/theme ${i % 2 === 0 ? "light" : "dark"}\r`);
        // A beat between submissions: the point is fifty *frames*, and fifty
        // lines arriving in one read is one decoded batch and one commit.
        await new Promise((r) => setTimeout(r, 15));
      }
      await pty.waitForFrame((f) => f.length === 24, 20_000);

      // **Every frame written during the run is whole**, which is what "no
      // half-themed frame" means from outside: a frame composed under one
      // theme and painted under another would be a row of a different width,
      // and a torn write would be a frame with the wrong row count.
      const frames = pty.output.split("\u001b[H").slice(1);
      expect(frames.length, "fifty toggles produced frames").toBeGreaterThan(10);
      for (const [i, frame] of frames.entries()) {
        const rows = frame.replaceAll(/\u001b\[[0-9;?]*[A-Za-z]/g, "").split(/\r*\n/);
        // The last chunk may still be arriving, so the final frame is allowed
        // to be short; every completed one is exactly the terminal's height.
        if (i === frames.length - 1) continue;
        expect(rows, `frame ${String(i)}`).toHaveLength(24);
      }

      // **And the session still takes input**, which a frame snapshot cannot
      // tell you: a session that had wedged would leave the last frame on the
      // screen looking exactly like a healthy one.
      //
      // **`promptRow`, not `find`** — and this row is why the helper is in the
      // harness. Since C22 I33 the transcript draws each entry with the command
      // that produced it, so the *first* `❯` on the screen is the topmost echo:
      // fifty `/theme` submissions put `❯ /theme light` at row 2 and left it
      // there, and a predicate asking whether it holds `still-here` could never
      // be satisfied again. The frame was whole and 24 rows the whole time.
      pty.type("still-here");
      await pty.waitForFrame((f) => promptRow(f).includes("still-here"), 15_000);
    } finally {
      pty.kill();
    }
  }, 60_000);
});
