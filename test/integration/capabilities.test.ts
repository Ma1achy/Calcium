// C02 tier 4 — integration.
//
// When written, every test here waited on a component that did not exist; at 2026-09-03 C01–C03
// and L4 are built. Each names its blocker in a greppable form, so `grep "waits on C01"` finds
// everything that just became unblocked — otherwise someone has to re-read six
// specs to know what to fill in.
//
// A fake standing in for a counterparty before that counterparty's spec is
// implemented would test the fake, not the seam.
import { afterEach, describe, expect, it } from "vitest";
import { detectCapabilities, type TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { MODES, fakeDebug, fakeStdin, fakeStdout } from "../support/fake-terminal.js";
import { ONE_PER_KIND, psTable } from "../support/blocks.js";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import { store, TONES } from "../support/theme.js";

/**
 * C01 over a real capability record. Deliberately not `capabilities(over)` from
 * the fake-terminal helpers: these two tests are about what *detection* produces
 * driving acquisition, so a hand-built record would test the seam against a
 * value no environment yields.
 */
const live: { release(): void }[] = [];

function harness(caps: TerminalCapabilities) {
  const stdout = fakeStdout();
  const lifecycle = createTerminalLifecycle({
    stdout,
    stdin: fakeStdin(),
    capabilities: caps,
    onFatal: ((err: unknown) => {
      throw err;
    }) as (err: unknown) => never,
    debug: fakeDebug(),
  });
  live.push(lifecycle);
  return { lifecycle, stdout };
}

afterEach(() => {
  // Handlers are process-global; an un-released instance leaks into the next
  // test, exactly as C01's own suite records.
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released, or never acquired. Neither is this test's business.
    }
  }
});

describe("C02 integration", () => {
  it("T4.1 (with C01 I10): a record drives acquisition, and nothing absent from it is acquired", () => {
    // **This test's title changed.** It read "a TERM=dumb record drives C01 to
    // acquire nothing beyond what is supported", which was written when C01 was
    // a spec and describes a contract C01 no longer has: a `TERM=dumb` record
    // has `altScreen: false`, and C01 I14 makes that fatal *before a byte is
    // emitted* rather than a partial acquisition. The old title implies C01
    // takes what it can and skips the rest; what it actually does is refuse.
    //
    // Both halves are worth having, so both are here — the refusal, and the
    // selective acquisition the title was reaching for, driven from a record
    // that can actually open a shell.
    const dumb = detectCapabilities({ TERM: "dumb" }).capabilities;
    expect(dumb.altScreen, "TERM=dumb is not usable").toBe(false);

    const refused = harness(dumb);
    expect(() => refused.lifecycle.acquire()).toThrow(/alternate screen unsupported/);
    // C01 I14, and the reason it is stated as "aborts before first paint": a
    // terminal that cannot open must not be half-configured on the way to
    // finding out.
    expect(refused.stdout.output).toBe("");

    // The selective half. A record with the alternate screen and nothing
    // optional takes exactly the three keys that are unconditional.
    const spare = harness({ ...dumb, altScreen: true });
    spare.lifecycle.acquire();
    const bytes = spare.stdout.output;

    expect(bytes).toContain(MODES.altScreenOn);
    expect(bytes).toContain(MODES.cursorHide);
    expect(bytes).not.toContain(MODES.pasteOn);
    expect(bytes).not.toContain(MODES.mouseOn);
    expect(bytes).not.toContain(MODES.mouseSgrOn);
  });

  it("T4.2 (with C01 I10): tmux gives mouse:false, and no 1002/1006 byte is emitted either way", () => {
    // tmux is the case the record exists for: everything else about a tmux
    // terminal says a modern emulator, and mouse reporting is the one thing
    // that does not pass through cleanly. So this is not a synthetic record —
    // it is the environment C02 §3 singles out.
    const tmux = detectCapabilities({
      TERM: "screen-256color",
      TMUX: "/tmp/tmux-1000/default,4242,0",
    }).capabilities;

    expect(tmux.mouse, "tmux suppresses mouse reporting").toBe(false);
    expect(tmux.altScreen, "and is otherwise a usable terminal").toBe(true);

    const { lifecycle, stdout } = harness(tmux);
    lifecycle.acquire();
    const acquisition = stdout.output;
    lifecycle.release();
    const everything = stdout.output;

    // "in acquisition or release" is the whole assertion: I6 releases the
    // inverse of `held`, so a mouse sequence that was never taken cannot be
    // emitted on the way out either. A release that emitted a fixed sequence
    // would fail here and pass every unit test.
    for (const mode of [MODES.mouseOn, MODES.mouseSgrOn, MODES.mouseOff, MODES.mouseSgrOff]) {
      expect(acquisition, `acquisition emitted ${mode}`).not.toContain(mode);
      expect(everything, `release emitted ${mode}`).not.toContain(mode);
    }

    // Not vacuous: the same run did take the modes tmux does support.
    expect(everything).toContain(MODES.altScreenOn);
    expect(everything).toContain(MODES.pasteOn);
    expect(everything).toContain(MODES.pasteOff);
  });
  it("T4.3 (with C10): the detected depth drives resolution, and 1-bit emits no colour", () => {
    // Driven from C02's side: the record decides and C10 obeys. "Distinct" is
    // the five tones whose confusion would mislead — `dim` and `muted` sharing a
    // grey at 4-bit costs nothing, and asserting all ten would assert a thing
    // the spec deliberately does not require.
    const sixteen = detectCapabilities({ TERM: "xterm" }).capabilities;
    const mono = detectCapabilities({ TERM: "dumb" }).capabilities;
    expect(sixteen.colourDepth).toBe(4);
    expect(mono.colourDepth).toBe(1);

    const themes = store();
    const meaning = ["ok", "warn", "error", "info", "accent"] as const;

    const indices = meaning.map((tone) => {
      const colour = resolveTone(tone, themes.current, sixteen).colour;
      expect(colour?.kind, tone).toBe("ansi16");
      return colour !== undefined && colour.kind === "ansi16" ? colour.index : -1;
    });
    expect(new Set(indices).size, "two meaning tones collapsed at 4-bit").toBe(5);

    for (const tone of TONES) {
      expect(resolveTone(tone, themes.current, mono).colour, `${tone} at depth 1`).toBeUndefined();
    }
  });
  it("T4.4a: unicode:'ascii' → every glyph C09 draws is ASCII, and the row count is unchanged", () => {
    // The half that landed with C09. The table and the sparkline are C11's and
    // C12's, and the deferral below now names them rather than C09 — a blocker
    // that is wrong is indistinguishable from one that is pending (A03 §9a).
    const unicode = measurable();
    const ascii = measurable({ capabilities: ASCII_CAPS });

    for (const fixture of Object.values(ONE_PER_KIND)) {
      const rows = ascii.renderToLines(fixture, 60);
      expect(rows, fixture.kind).toHaveLength(unicode.renderToLines(fixture, 60).length);
    }

    const panel = ONE_PER_KIND.panel;
    const drawn = ascii.renderToLines(panel, 40).map(visible).join("");
    expect(drawn.includes("+"), "corners degrade to +").toBe(true);
    expect([...drawn].every((ch) => (ch.codePointAt(0) ?? 0) < 0x80)).toBe(true);
  });

  it("T4.4: unicode:'ascii' → a rendered table emits no codepoint above U+007F", () => {
    // The table half of this. A sparkline is C12's and the deferral below keeps it.
    //
    // A table draws more glyph rôles per row than any other kind — the expand
    // marker, a status glyph per row, the truncation marker, the sort indicator —
    // and every one has to substitute 1:1 by column count or the measured height is
    // wrong for users with a non-UTF-8 locale and nobody else (C09 §4).
    const table = psTable({ rows: 3, expanded: [1], sort: { key: "age", direction: "desc" } });
    const kit = measurable({ definitions: [tableDefinition], capabilities: ASCII_CAPS });
    // 100 rather than 80: `mr` drops there, so the expand markers are drawn, and
    // `owner` is visible at its declared minimum of 8, so `malachy@fmx.io`
    // truncates. Both markers in one frame is the point — each has an ASCII form
    // and each is a place the 1:1 rule can break.
    const drawn = kit.renderToLines(table, 100).map(visible);

    expect(drawn.join("")).not.toBe("");
    for (const line of drawn) {
      const offending = [...line].filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x80);
      expect(offending, `beyond ASCII: ${offending.join(" ")}`).toEqual([]);
    }
    // The ASCII forms, present rather than merely not-Unicode: `>` for a collapsed
    // row, `v` for an open one, `~` for a truncation, `v` for the descending sort.
    const header = drawn[0] ?? "";
    const open = drawn.find((l) => l.includes("a3f9b21")) ?? "";
    const closed = drawn.find((l) => l.includes("2e8a04c")) ?? "";
    expect(header, "the descending sort indicator").toContain("age v");
    expect(open, "an expanded row").toContain("v ");
    expect(closed, "a collapsed row").toContain("> ");
    expect(drawn.join("\n"), "the ASCII truncation marker").toContain("malachy~");

    // And the geometry is the Unicode case's, exactly.
    const full = measurable({ definitions: [tableDefinition] });
    expect(kit.measure(table, 100)).toBe(full.measure(table, 100));
    expect(drawn.map((l) => cells(l))).toEqual(
      full.renderToLines(table, 100).map((l) => cells(visible(l))),
    );
  });
  it("T4.5 (with C12): unicode:'ascii' → the ramp replaces braille, geometry unchanged", () => {
    const plot = block({
      kind: "plot",
      id: "loss",
      form: "line",
      height: 6,
      axes: true,
      xLabels: ["epoch 0", "epoch 20", "now"],
      series: [{ values: Array.from({ length: 30 }, (_, i) => 0.82 * 0.9 ** i) }],
    });

    const ascii = measurable({ definitions: [plotDefinition], capabilities: ASCII_CAPS });
    const full = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

    const degraded = ascii.renderToLines(plot, 100);
    expect(degraded.join(""), "no braille under ascii").not.toMatch(/[\u2800-\u28ff]/u);
    expect(degraded.join(""), "the column ramp instead").toMatch(/[.:\-=+*#@]/u);
    expect(degraded.join(""), "and an ASCII axis").toContain("+");

    // Identical cell grid, only subcell resolution lost (C12 I9). Asserted on the
    // row count and on the measured height, which is the pair C09 I1 turns on —
    // per-row width is not the claim, because a ramp cell is one dot column and a
    // braille cell is two, so the same sample lands in a different cell.
    expect(degraded).toHaveLength(full.renderToLines(plot, 100).length);
    expect(ascii.measure(plot, 100)).toBe(full.measure(plot, 100));
  });
  it("T4.6 (with C03): synchronisedUpdate:false → frames carry no 2026 wrapper", () => {
    // Driven from C02's side: the record decides, and C03 obeys it. Both
    // directions, because the negative alone passes when C03 wraps nothing.
    const written: string[] = [];
    function framesFor(env: Record<string, string>): string {
      written.length = 0;
      const capabilities = detectCapabilities(env).capabilities;
      const scheduler = createFrameScheduler({
        render: () => {},
        repaint: () => {},
        capabilities,
        lifecycle: { acquired: true },
        write: (s) => void written.push(s),
        schedule: () => ({ [Symbol.dispose]: () => {} }),
      });
      scheduler.commit("input");
      return written.join("");
    }

    expect(framesFor({ TERM: "xterm-256color" })).toBe("");
    expect(framesFor({ TERM: "dumb" })).toBe("");

    const wrapped = framesFor({ TERM: "xterm-kitty" });
    expect(wrapped).toContain(MODES.syncOn);
    expect(wrapped).toContain(MODES.syncOff);
  });
  it.todo(
    "T4.7: altScreen:false → the shell prints help and exits 0 without acquiring anything — restated, and not deferred on a component, because it named the wrong gate. C22 §4 step 1 exists now and keys on `stdout.isTTY`, which is a different fact: a `TERM=dumb` session on a real terminal passes gate 1 and is refused by C01, whose T3.15 says `acquire()` invokes `onFatal` without emitting anything and whose T4.1b asserts it against a real record. So the behaviour this row describes — *prints help and exits 0* — is not what the tree does, and nothing has ruled that it should. What is missing is a ruling: whether `altScreen: false` on a TTY should stay fatal, as `lifecycle.ts` makes it, or become a second graceful gate beside the TTY one — and C22 §4 has no such step. Until that is decided, T4.1b is the coverage and this row would duplicate it",
  );
});
