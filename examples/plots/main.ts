/**
 * The plot system in a real terminal.
 *
 * **Every instrument this repository has compares bytes** — golden frames, the
 * collision sweep, the pair sheet, the arm-disagreement record, the terminal
 * baseline. None can see a flicker, a jump, or a colour that reads badly on a
 * real emulator, and until this existed nothing had looked.
 *
 * Seven commands, and each answers something the gates cannot:
 *
 *     /all              every form the type declares, and every rung
 *     /form <name>      one form, full size, with its rungs
 *     /live <name>      the same form, advancing
 *     /compare <name>   the two renderers side by side, as pixels
 *     /faults           what a failing source looks like, and the way back
 *     /monitor          this machine, live
 *     /sample           the far side, adapted
 *
 *     npm start
 *
 * **This file is the wiring and nothing else** (F400). Every document it serves
 * is built in `src/commands.ts`, because `await tui.start()` below runs at
 * module scope: a test importing this file starts a terminal session, so while
 * the builders lived here nothing could construct a document and check it. The
 * suite tested the pieces instead, and passed for a session while `/all` and
 * `/form` drew nothing.
 */
import { b, createTui, defaultTheme, PANES, profilePane } from "@fmx/calcium";
import type { Adapter, Block, LocalHandler, PaneName } from "@fmx/calcium";
import {
  adaptSample, barStyles, compare, everyForm, faults, formFull, formIn, greetingDocument, images, liveFor,
  monitor, mosaics, rungs, spinners, unknown,
} from "./src/commands.ts";
import { faultyDefinition } from "./src/faulty.ts";
import { manifest } from "./src/manifest.ts";

const BINARY = new URL("bin/plots", import.meta.url).pathname;

const doc = (command: string, blocks: readonly Block[]): ReturnType<LocalHandler> => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
});

const draw: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => adaptSample(raw.stdoutRaw, ctx.command),
};

const tui = createTui({
  name: "plots-tui",
  binary: BINARY,
  manifest,
  theme: defaultTheme,
  env: process.env,
  adapters: { sample: draw },
  // **A kind the app registers, and the extension mechanism is the point.**
  // `table`, `plot` and `patch` register through this same public route rather
  // than being privileged (C09 §3), so an app-defined kind is not a special case.
  // This one throws on purpose: the containment boundary draws the `status` box
  // at the height the block committed, which is the only way to see the ladder
  // above two rows.
  blocks: [faultyDefinition],
  // **C28, on and at the tier that records durations.** A demo is exactly the
  // case the profiler was built for: every figure `/profile` draws below is
  // measured off this session's own frames, so the numbers move when the
  // terminal is resized, a plot is scrolled, or `/all` draws thirty-six forms.
  profile: { tier: "spans", sampleMs: 500 },
  // **Each handler names `LocalHandler`**, which is C24 §8b's finding applied
  // rather than restated: a handler written with inferred parameters is legal
  // TypeScript that compiles, registers, runs, and can never see a field the
  // framework adds (F125). Four of the reference app's eight handler families
  // were in that state.
  localHandlers: {
    all: ((_argv, ctx) => doc(ctx.command, [everyForm(0)])) satisfies LocalHandler,

    form: ((argv, ctx) => {
      const form = formIn(argv);
      return doc(ctx.command, form === null ? [unknown(argv[0] ?? "")] : formFull(form));
    }) satisfies LocalHandler,

    live: ((argv, ctx) => {
      const form = formIn(argv);
      // **A second word names a rung** — `/live plot3d teapot`. The form
      // resolves first, so an unknown one still reports as an unknown form.
      return doc(ctx.command, form === null ? [unknown(argv[0] ?? "")] : liveFor(form, argv[1]));
    }) satisfies LocalHandler,

    compare: (async (argv, ctx) => {
      const form = formIn(argv);
      if (form === null) return doc(ctx.command, [unknown(argv[0] ?? "")]);
      return doc(ctx.command, await compare(form, 0, ctx.capabilities));
    }) satisfies LocalHandler,

    faults: ((_argv, ctx) => doc(ctx.command, [faults()])) satisfies LocalHandler,

    monitor: ((_argv, ctx) => doc(ctx.command, [monitor()])) satisfies LocalHandler,

    /**
     * **The framework profiling itself, drawn with the framework's own plots.**
     *
     * `ctx.profile` is `undefined` unless `TuiConfig.profile` was set, so the
     * absent arm is real rather than defensive — and it is what every app that
     * does not ask for a profiler sees.
     */
    profile: ((argv, ctx) => {
      const report = ctx.profile?.();
      if (report === undefined) {
        return doc(ctx.command, [
          b.notice("warn", "no profiler on this session — set `profile` in the config", undefined, {
            id: "prof-off",
          }),
        ]);
      }
      const asked = (argv[0] ?? "overview") as PaneName;
      const pane: PaneName = PANES.includes(asked) ? asked : "overview";
      return doc(ctx.command, [
        b.notice("info", `pane \`${pane}\` · ${PANES.join(" · ")}`, undefined, { id: "prof-nav" }),
        ...profilePane(report, pane, ctx.capabilities),
      ]);
    }) satisfies LocalHandler,

    rungs: ((_argv, ctx) => doc(ctx.command, [rungs()])) satisfies LocalHandler,

    mosaic: ((_argv, ctx) => doc(ctx.command, [mosaics(0)])) satisfies LocalHandler,

    image: ((_argv, ctx) => doc(ctx.command, [images()])) satisfies LocalHandler,
    spinners: ((_argv, ctx) => doc(ctx.command, [spinners()])) satisfies LocalHandler,
    bars: ((_argv, ctx) => doc(ctx.command, [barStyles()])) satisfies LocalHandler,
  },
  /**
   * **`--ambiguous-wide` demotes the glyph ladder by one rung** (C09 I37).
   *
   * `TuiConfig.capabilities` is a published member no example named, and this is
   * the honest use for it: `▀` is `East_Asian_Width=Ambiguous`, so a terminal
   * declaring `wide` cannot spend a cell on two colours without drawing the
   * picture at double the width `imageCells` measured. Passing it here is how the
   * same images are read on **both** arms in one terminal — the comparison no
   * capability detection can produce, because a terminal reports one answer.
   *
   * From `argv` rather than the environment, deliberately: C02 owns
   * `process.env` and an app reaching for it to fake a capability would be
   * working around the seam that exists for this.
   */
  ...(process.argv.includes("--ambiguous-wide")
    ? { capabilities: { ambiguousWidth: "wide" as const } }
    : {}),
  greeting: greetingDocument,
});

await tui.start();
