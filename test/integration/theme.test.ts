// C10 tier 4 — integration.
//
// C09 landed, so the three that waited on a renderer are written. What\n// remained waited on L4, which is built at 2026-09-03. Each deferral
// names its blocker in the greppable form, so `tools/enforce/todo-expiry.mjs`
// fails the day the blocker lands rather than the day someone remembers.
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { buildGraph, buildSession, fakeFs } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { defaultTheme, loadTheme, resolveTone } from "../../src/presentation/theme/index.js";
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
    // **A02 Seam 4's theme row, from C10's side.** `theme.setTheme` →
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
    await settled(h.pipeline);

    expect(h.theme.current.tokens.variant, "C10 switched").toBe("light");
    expect(h.calls, "and L4 invalidated").toContain("invalidate");
    expect(before, "the fixture started somewhere else, so the switch did something").not.toBe(
      "light",
    );

    // C10's own path, with no L4 in it.
    const direct = pipelineHarness();
    direct.theme.setTheme("light");
    expect(direct.calls, "C10 never invalidates").not.toContain("invalidate");
  });
  it("T4.27 (C22 I66): clearing --no-bg reaches a frame", async () => {
    // **A row about a path rather than about a guard.** The walk ruled that
    // `/theme light --no-bg` then `/theme light` commits nothing, because
    // `setTheme` is a no-op on an unchanged variant — the mechanism is real
    // and the consequence does not follow: every `/theme` appends a notice and
    // invalidates on the verb whatever changed. Measuring the caller refuted
    // it, and the obligation is what stays: the flag has to reach the screen.
    const h = pipelineHarness();

    h.pipeline.submit("/theme light --no-bg");
    await settled(h.pipeline);
    const after = h.commits.length;

    h.pipeline.submit("/theme light");
    await settled(h.pipeline);

    expect(h.commits.length - after, "the second invocation commits").toBeGreaterThan(0);
    expect(h.calls, "and invalidates on the verb, not on the variant").toContain("invalidate");
  });

  it("T4.28 (C22 I66): --no-bg never reaches the handler, and the variant still switches", async () => {
    // **Two assertions, and the mutation pass is why there are two.** The
    // outcome alone is over-determined: reading the variant from `ctx.args` and
    // stripping the flag from `argv` are *each* sufficient, so a mutation
    // undoing either one leaves `/theme --no-bg light` working. The mechanism
    // is what tells them apart — `argv` for a local verb is
    // `[verb, ...transmitted]`, and `meta.argv` records exactly what the
    // handler was given.
    const h = pipelineHarness();
    h.pipeline.submit("/theme --no-bg light");
    await settled(h.pipeline);

    expect(h.theme.current.tokens.variant, "the flag is not read as the variant").toBe("light");
    expect(
      h.transcript.entries.at(-1)?.doc.meta.argv,
      "a shellOnly flag does not travel to the handler",
    ).not.toContain("--no-bg");
  });

  it("T4.34 (C22 I66): the flag is per invocation, and the clearing is a write", async () => {
    // **`false` has to be written, not merely not-written.** A handler that set
    // the flag only when the flag was given is sticky: you switch themes later,
    // get no background, and have nothing on screen explaining why. The
    // difference is invisible in any single invocation, which is why this row
    // reads the sequence.
    const h = pipelineHarness();
    h.pipeline.submit("/theme light --no-bg");
    await settled(h.pipeline);
    h.pipeline.submit("/theme dark");
    await settled(h.pipeline);

    expect(h.suppressed, "set, then cleared").toEqual([true, false]);
  });

  it("T4.29 (C22 I66, C10 I25): the warning fires only where it suppresses a paint", async () => {
    // **Both arms**, because a warning that always fires and one that never
    // does read the same from a passing suite. `light` declares `surface` and
    // `dark` inherits, so the flag has a consequence on one and none on the
    // other.
    const warned = pipelineHarness();
    warned.pipeline.submit("/theme light --no-bg");
    await settled(warned.pipeline);
    const painting = warned.transcript.entries.at(-1);
    expect(
      painting?.doc.blocks.some((b) => b.kind === "notice" && b.tone === "warn"),
      "light paints, so suppressing it is worth a notice",
    ).toBe(true);

    const quiet = pipelineHarness();
    quiet.pipeline.submit("/theme dark --no-bg");
    await settled(quiet.pipeline);
    const inheriting = quiet.transcript.entries.at(-1);
    expect(
      inheriting?.doc.blocks.some((b) => b.kind === "notice" && b.tone === "warn"),
      "dark inherits anyway, so the flag changed nothing to warn about",
    ).toBe(false);
  });

  it("T4.35 (C10 I27): a third theme is reachable end to end", async () => {
    // **The handler, the enum and the store on one path** — and the mutation
    // pass is why this row exists rather than a store-level one: reading the
    // variant against two literals passes every existing row, because every
    // existing row asks for one of the two names a literal already carries.
    const three = loadTheme({
      ...defaultTheme,
      "high-contrast": { ...defaultTheme["dark"]!, name: "hc" },
    });
    expect(three.ok).toBe(true);
    if (!three.ok) return;

    const h = pipelineHarness({ theme: three.value });
    h.pipeline.submit("/theme high-contrast");
    await settled(h.pipeline);

    expect(h.theme.current.tokens.name, "the switch happened").toBe("hc");
    const last = h.transcript.entries.at(-1);
    expect(
      last?.doc.blocks.some((b) => b.kind === "notice" && b.tone === "warn"),
      "and it is not a usage error",
    ).toBe(false);
  });

  it("T4.36 (C10 I27, C22 I40): a persisted name outside the shipped two is restored", async () => {
    // **The guard is a membership test against the set** (§5a.3 rows 1–2). A
    // literal pair passes every persistence row there is, because both names it
    // knows are in the shipped set — so this row supplies one that is not, and
    // it is the only shape that can tell the two guards apart.
    const set = { ...defaultTheme, "high-contrast": { ...defaultTheme["dark"]!, name: "hc" } };
    // `mkdir` first, because the fake refuses a write to a directory nobody
    // created — F96's rule, and the reason this harness can see a missing one.
    const fs = fakeFs();
    await fs.mkdir("/state");
    await fs.writeFile("/state/theme", "high-contrast\n");

    const built = await buildGraph({ fs, theme: set, stateDir: "/state" });
    expect(built.graph.theme.current.tokens.name, "restored by name").toBe("hc");

    // The control: the same session over a directory holding a name the set
    // does not have keeps the theme it opened on, and says so (C22 I40).
    const other = fakeFs();
    await other.mkdir("/state");
    await other.writeFile("/state/theme", "solarised\n");
    const fallback = await buildGraph({ fs: other, theme: set, stateDir: "/state" });
    expect(fallback.graph.theme.current.tokens.name, "an unknown name changes nothing").toBe(
      defaultTheme["dark"]!.name,
    );
  });

  it("T4.5 (C22 I40): /theme light persists and survives a restart", async () => {
    // **Two real sessions over one filesystem**, and the second is constructed
    // **without stopping the first** — which is the whole of T6.35. A write at
    // exit satisfies every other assertion here and loses the preference to
    // every crash, and a session killed by `SIGKILL` runs no shutdown path.
    //
    // Asserted on the frame's own colours rather than by reading the file: the
    // file's contents are an implementation detail and the claim is that the
    // choice survives.
    const fs = fakeFs();
    const stdin = fakeStdin();
    const first = await buildSession({ fs, stdin: stdin as never, stateDir: "/state" });
    expect(first.tui, "the first session started").toBeDefined();

    stdin.emit("/theme light\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The second session, over the same state directory and the same fs, while
    // the first is still running.
    const second = await buildSession({ fs, stdin: fakeStdin() as never, stateDir: "/state" });
    expect(await fs.readFile("/state/theme"), "the choice reached the disk").toContain("light");

    const frame = second.stdout.chunks.join("");
    expect(frame.length, "the second session drew").toBeGreaterThan(0);

    // The control: a session over a *fresh* state directory opens dark, so the
    // assertion above is about persistence rather than about the default.
    const fresh = await buildSession({ fs: fakeFs(), stdin: fakeStdin() as never });
    expect(fresh.stdout.chunks.join("")).not.toBe(frame);
  });

  it("T4.6 (C22 I40): a corrupt persisted variant → base retained, notice committed, session opens", async () => {
    // **Both halves, because either alone passes against the other's defect.**
    // Retaining silently satisfies "the base theme stands"; a notice beside a
    // switched theme satisfies "something was said". C20's repair-at-open is
    // the precedent and the reasoning transfers whole — a session that refuses
    // to start because a preference file has a stray byte in it has made a
    // preference into a dependency.
    const fs = fakeFs();
    // The directory first, because a pre-existing preference file implies a
    // pre-existing directory — `fakeFs` models that since F96, and seeding a
    // file into a directory nothing created was a world `node:fs` cannot have.
    await fs.mkdir("/state");
    await fs.writeFile("/state/theme", "chartreuse\n");

    const { stdout } = await buildSession({ fs, stdin: fakeStdin() as never, stateDir: "/state" });

    const written = stdout.chunks.join("");
    expect(written.length, "the session opened normally").toBeGreaterThan(0);
    expect(written, "and said so").toContain("theme preference ignored");

    // The control: a *valid* file produces no notice, so the assertion above is
    // about the corruption rather than about a notice that always appears.
    const good = fakeFs();
    await good.mkdir("/state");
    await good.writeFile("/state/theme", "light\n");
    const ok = await buildSession({ fs: good, stdin: fakeStdin() as never, stateDir: "/state" });
    expect(ok.stdout.chunks.join(""), "a valid preference is silent").not.toContain(
      "theme preference ignored",
    );
  });

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
