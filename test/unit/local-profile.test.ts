// C23 — `/profile [section]`, the seventh shipped local verb
// (docs/components/C23_execution_pipeline.md §2, §10), tier 1.
//
// **Driven through `shippedHandlers` and through a real pipeline over the
// framework's rows.** The `profile` row is in `FRAMEWORK_TOOLS` and C23 I27
// refuses a row without a handler at every startup, so the handler exists
// whether or not a recorder does and says so in a notice when none does (T4.67).
//
// **`HandlerDeps.profileView` is gone with the pushed view** (C28 §3c,
// R-EXA-082, F1254). Every arm of the verb now composes a document: the section
// arm draws its cards through `profileCard`, the seam §3c had already published
// *for a consumer with its own navigation*, and the transcript is that consumer.
// A fake view stood at the top of this file recording what it was asked to open;
// what these rows read instead is the document, which is the artefact.
import { describe, expect, it } from "vitest";

import { FRAMEWORK_TOOLS } from "../../src/data/manifest/framework.js";
import type { Block, LocalDocument, Notice } from "../../src/data/viewmodel/index.js";
import { shippedHandlers } from "../../src/shell/local/handlers.js";
import type { HandlerDeps } from "../../src/shell/local/handlers.js";
import type { LocalContext } from "../../src/shell/local/registry.js";
import { SECTIONS, cardsOf } from "../../src/shell/profiling/panes/index.js";
import { liveDeclarations } from "../../src/shell/builders/live.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { TIER_RANK } from "../../src/shell/profiling/types.js";
import type { ProfileReport, Profiler, Tier } from "../../src/shell/profiling/types.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { FULL_CAPABILITIES, producerContext } from "../support/producer-context.js";
import type { ProducerContext } from "../../src/data/adapters/types.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const deps = (
  report: () => ProfileReport | null = () => null,
  capture: HandlerDeps["profileCapture"] = null,
): HandlerDeps => ({
  profileCapture: capture,
  manifest: () => null,
  currentScope: () => "prompt",
  transcript: createTranscriptStore(),
  // The stubs `execution.test.ts` uses: `/profile` reads none of these.
  theme: {
    current: {} as never,
    setTheme: () => undefined,
    applyOverrides: () => [],
  } as unknown as HandlerDeps["theme"],
  setSuppressBackground: () => undefined,
  history: () => [],
  bindings: () => [],
  stop: () => Promise.resolve(0),
  // `/profile` reads no capability either (C22 I125's verb does).
  capabilities: () => ({ values: {} as never, sources: {} as never }),
  // `null` by default — the state a session built without `TuiConfig.profile`
  // is in, and the one every row above this round was written against.
  profileReport: report,
});

const ctx = (
  args: Readonly<Record<string, unknown>> = {},
  over: Partial<ProducerContext> = {},
): LocalContext => ({
  ...producerContext(over),
  command: "/profile",
  ask: () => Promise.resolve({ key: "" }),
  args,
});

const NO_PROFILER = "no profiler to show — this session was built without `TuiConfig.profile`";

/** The six the framework shipped before this round, by key. */
const SIX = ["clear", "debug", "exit", "help", "history", "theme"];
/** And the two since: `/profile`, and `/capabilities` (C22 I125, C05 §3). */
const EIGHT = [...SIX, "profile", "capabilities"].sort();

const run = async (
  handlers: Readonly<Record<string, (argv: readonly string[], c: LocalContext) => LocalDocument | Promise<LocalDocument>>>,
  argv: readonly string[],
  args: Readonly<Record<string, unknown>> = {},
  over: Partial<ProducerContext> = {},
): Promise<LocalDocument> => {
  const handler = handlers["profile"];
  if (handler === undefined) throw new Error("no `profile` handler in the map");
  return handler(argv, ctx(args, over));
};

const notices = (blocks: readonly Block[]): readonly Notice[] =>
  blocks.filter((x): x is Notice => x.kind === "notice");

/**
 * The top-level panels the section arm composes, in the order it wrote them,
 * with `blockId`'s uniqueness counter stripped.
 *
 * **The counter is process-global** (`documents.ts:38`) — block ids are
 * addressed by `ViewPatch`, so every id carries a `-<n>` that depends on how
 * many documents the file has already composed. A row asserting the whole id
 * asserts the order its own file runs in.
 */
const panelIds = (blocks: readonly Block[]): readonly string[] =>
  blocks.filter((x) => x.kind === "panel").map((x) => (x.id ?? "").replace(/-\d+$/u, ""));

/**
 * A section's expected panel ids, from the **register**.
 *
 * Only for a section with no `perFrame` card — `verdict` and `framework` — where
 * one card is one panel. `app`'s deck expands a per-frame card per retained
 * frame, and a row that wanted its ids would have to ask `deckOf`, which is the
 * function under test.
 */
const idsOf = (section: "verdict" | "framework"): readonly string[] =>
  cardsOf(section).map((c) => `profile-${c.id}`);

/** Every `{ kind, id }` in a block tree, whatever nests what. */
const walk = (node: unknown, out: { kind: string; id?: string }[] = []): { kind: string; id?: string }[] => {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return out;
  }
  if (node !== null && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o["kind"] === "string") {
      out.push({ kind: o["kind"], ...(typeof o["id"] === "string" ? { id: o["id"] } : {}) });
    }
    for (const v of Object.values(o)) walk(v, out);
  }
  return out;
};

/**
 * A profiler with a few frames in it and `setTier` counted.
 *
 * The spy delegates rather than replacing: `tier` and `own` are closure-backed
 * getters on the recorder, so a prototype view reads them live and only the
 * member a row counts is shadowed — the shape `profile-view.test.ts`'s rig uses,
 * reduced to the one member these rows read.
 */
const spiedProfiler = (tier: Tier): { profiler: Profiler; setTierCalls: Tier[] } => {
  let t = 0;
  const real = createProfiler({ tier }, { elapsed: () => (t += 1) });
  for (let i = 0; i < 8; i += 1) {
    real.commit("input", false);
    real.beginFrame("input");
    {
      using _a = real.span("compose");
    }
    real.endFrame("frame");
  }
  const setTierCalls: Tier[] = [];
  const profiler = Object.create(real) as Profiler;
  profiler.setTier = (next: Tier): void => {
    setTierCalls.push(next);
    real.setTier(next);
  };
  return { profiler, setTierCalls };
};

describe("C23 — /profile, the local route", () => {
  it("T1.64 (C23 I68, C23 I27): with no recorder the section arm is a `warn` notice of the verb's own, and the handler is one of eight either way", async () => {
    // **The refusal is the verb's, not a view's** (C28 §3c, R-EXA-082, F1254).
    // It used to be a string `view.open` returned and the route wrapped; the
    // reader is `() => ProfileReport | null` now, so the arm that answers `null`
    // is the handler's own and the sentence is written where it is read.
    const handlers = shippedHandlers(deps());
    expect(Object.keys(handlers).sort()).toEqual(EIGHT);

    const doc = await run(handlers, []);
    const found = notices(doc.blocks);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe("warn");
    expect(found[0]?.text).toBe(NO_PROFILER);
    expect(doc.command, "the default section, named on the entry's command").toBe("/profile verdict");

    // **Arm 2: the handler does not depend on what the reader answers.** A
    // session that has a profiler yields the same eight keys — the row is in
    // `FRAMEWORK_TOOLS`, so a map that dropped `profile` on any condition is
    // what C23 I27 refuses at startup.
    const accepting = shippedHandlers(deps(() => spiedProfiler("spans").profiler.report()));
    expect(Object.keys(accepting).sort()).toEqual(EIGHT);
    expect(accepting).toHaveProperty("profile");
  });

  it("T1.65 (C23 I68, C22 I66): the section comes from `args`, and a token that is not a section gets a usage notice", async () => {
    const { profiler } = spiedProfiler("spans");
    const handlers = shippedHandlers(deps(() => profiler.report()));

    // `/profile framework`, as C05 hands it over: parsed into `args`. **What
    // the row reads is the document**, which is the artefact — the entry's
    // command and the cards it carries — rather than a spy on a seam that is
    // gone.
    //
    // **`framework` and `verdict` rather than `app`**: neither holds a
    // `perFrame` card, so the expected ids are `cardsOf` and not `deckOf`, and
    // the row does not assert the handler against the function the handler
    // calls.
    const ok = await run(handlers, ["framework"], { section: "framework" });
    expect(ok.command).toBe("/profile framework");
    expect(panelIds(ok.blocks)).toEqual(idsOf("framework"));

    // `/profile foo`: validation failed, so `args` is empty and `argv` carries
    // the token. Usage names all three sections and quotes what was typed.
    const bad = await run(handlers, ["foo"]);
    const usage = notices(bad.blocks);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.tone).toBe("warn");
    for (const section of SECTIONS) expect(usage[0]?.text).toContain(section);
    expect(usage[0]?.text).toContain("`foo`");
    expect(panelIds(bad.blocks), "and no deck was drawn").toEqual([]);

    // **The section is asserted to come from `args`**: `argv[0]` says one thing
    // and `args.section` another, and a handler reading `argv` would draw the
    // wrong section's cards while passing both arms above.
    const crossed = await run(handlers, ["verdict"], { section: "framework" });
    expect(crossed.command).toBe("/profile framework");
    expect(panelIds(crossed.blocks)).toEqual(idsOf("framework"));
  });

  it("T1.66 (C23 I69, C28 §3c): the document names the section and carries the whole of it", async () => {
    // **The row is inverted, and that is the change** (R-EXA-082, F1254). It
    // asserted *no plot anywhere in the tree* and *no block of any card's*,
    // because the section's deck lived behind a pushed view and the entry was a
    // one-line receipt for having opened it. There is no view, so the entry is
    // the deck: one panel per deck entry, in deck order, each carrying its
    // card's own blocks.
    const { profiler } = spiedProfiler("spans");
    const doc = await run(shippedHandlers(deps(() => profiler.report())), ["framework"], {
      section: "framework",
    });

    expect(doc.command).toBe("/profile framework");
    expect(notices(doc.blocks), "no receipt notice — the cards are the answer").toEqual([]);
    expect(panelIds(doc.blocks)).toEqual(idsOf("framework"));

    // **Every card's own id**, from the register rather than a prefix an id
    // convention happens to share: `card-<id>` is what the deck frames with, and
    // a regex over four two-letter prefixes was a guess that outlived the panes
    // it was written for.
    const tree = walk(doc.blocks);
    const cardIds = tree.filter((n) => n.id !== undefined && n.id.startsWith("card-"));
    expect(cardIds.length, "and every card framed one").toBe(cardsOf("framework").length);
  });

  it("T1.96 (C23 I69, C09 I49): the cards are drawn with the context's capabilities, never the deck's ASCII default", async () => {
    // **The view handed `detection.capabilities` whole and the handler does
    // now** (R-EXA-082, F1254). The seam moved and the claim did not: the deck
    // takes an ASCII fallback for a caller with no terminal, and a verb running
    // inside a session has one, so a card that took the default would read
    // `frame-site spans : …` on a unicode terminal with nothing else on screen
    // different.
    //
    // **The slot is the card's generated footer** (C28 I57), which is where the
    // deck joins its population and its exclusions — not a string the card
    // chose to spell either way.
    const { profiler } = spiedProfiler("spans");
    const handlers = shippedHandlers(deps(() => profiler.report()));
    const ascii: TerminalCapabilities = { ...FULL_CAPABILITIES, unicode: "ascii" };

    const under = async (capabilities: TerminalCapabilities): Promise<string> =>
      JSON.stringify((await run(handlers, ["framework"], { section: "framework" }, { capabilities })).blocks);

    const drawnAscii = await under(ascii);
    expect(drawnAscii, "the ASCII arm's separator").toContain("frame-site spans : ");
    expect(drawnAscii, "and not the ambiguous-width one").not.toContain("·");

    const drawnFull = await under(FULL_CAPABILITIES);
    expect(drawnFull, "the unicode arm's — the one the default would never draw").toContain(
      "frame-site spans · ",
    );
  });

  it("T1.66b (C23 I69): `snapshot` appends a stamped panel and no live part; `live` appends a cadence and no stamp", async () => {
    const { profiler } = spiedProfiler("spans");
    const handlers = shippedHandlers(deps(() => profiler.report()));

    // --- the snapshot arm -----------------------------------------------------
    const snap = await run(handlers, ["snapshot"], { section: "snapshot" });
    const snapPanel = snap.blocks.find((x) => x.kind === "panel");
    expect(snapPanel, "one panel").toBeDefined();

    // **Read as fields, not as a sentence.** The stamp is four facts and the
    // row asserts all four are present; a reworded stamp fails here only when
    // one of them goes missing, which is the failure worth having. A regex over
    // the whole string would fail on every wording change and pass on a stamp
    // that had quietly lost its tier.
    const title = (snapPanel as { title?: string }).title ?? "";
    expect(title, "the card it is of").toContain("verdict");
    expect(title, "the frame range").toMatch(/\d+ frames/u);
    expect(title, "the elapsed time").toMatch(/captured \d+\.\d s/u);
    expect(title, "the tier it was recorded at").toMatch(/tier (?:off|counters|spans|full|deep)/u);
    expect(title, "and how far back the ring reaches").toMatch(/ring (?:reset|never reset)/u);

    // **And it is one-shot**: a stamp and a cadence on one block would be two
    // claims about the same fact, disagreeing between ticks.
    expect(liveDeclarations(snap.blocks), "no live part on a snapshot").toEqual([]);

    // --- the live arm ---------------------------------------------------------
    const live = await run(handlers, ["live"], { section: "live" });
    const declared = liveDeclarations(live.blocks);
    expect(declared, "one live part").toHaveLength(1);
    expect(declared[0]?.spec.every, "on the sampler's own cadence").toBe(1000);
    const liveTitle = declared[0]?.spec.title ?? "";
    expect(liveTitle, "the card it is of").toContain("verdict");
    // The stamp's fields, absent — a live part is current because it refetches.
    expect(liveTitle, "no frame range").not.toMatch(/\d+ frames/u);
    expect(liveTitle, "no elapsed time").not.toMatch(/captured/u);

    // The card is the one named, when one is named — `cardFor` falls to the
    // verdict and a row asserting only the default cannot tell the two apart.
    const named = await run(handlers, ["snapshot"], { section: "snapshot", card: "the-pairs" });
    expect((named.blocks.find((x) => x.kind === "panel") as { title?: string }).title).toContain(
      "the-pairs",
    );
  });

  it("T1.66c (C23 I69, C28 I18): a live card calls `setTier` zero times at every tier, and below `spans` draws the raise notice rather than a figure", async () => {
    // **The count and the notice together**, because the count alone is
    // satisfied by a verb that raises nothing and draws nothing. The second
    // half is what makes the first worth asserting.
    // **Every tier, from `TIER_RANK` rather than a list with a birthday**: a
    // tier added later is asserted here the day it exists rather than the day
    // someone remembers this row.
    for (const tier of Object.keys(TIER_RANK) as readonly Tier[]) {
      const { profiler, setTierCalls } = spiedProfiler(tier);
      const handlers = shippedHandlers(deps(() => profiler.report()));
      const doc = await run(handlers, ["live"], { section: "live" });
      const spec = liveDeclarations(doc.blocks)[0]?.spec;
      expect(spec, `a live part at ${tier}`).toBeDefined();
      if (spec === undefined) continue;

      // Drive the part the way C23's driver does: fetch, then render.
      const data = await spec.fetch();
      const drawn = spec.render(data, producerContext());

      if (TIER_RANK[tier] < TIER_RANK.spans) {
        expect(drawn.kind, `at ${tier} the first render is the notice`).toBe("notice");
        const text = (drawn as { text?: string }).text ?? "";
        expect(text, "naming the tier it found").toContain(`\`${tier}\``);
        // **It names the change to make, not another surface to open**
        // (R-EXA-082, F1254). The sentence used to point at `/profile`, which
        // raised to `spans` while its layer was up and restored the tier at the
        // pop; nothing in a running session raises a tier now, so the only
        // honest instruction is the config and a restart.
        expect(text, "naming the config that would change it").toContain("profile: { tier:");
        expect(text, "and why it is not done from here").toContain("ring");
      } else {
        expect(drawn.kind, `at ${tier} it is a figure`).not.toBe("notice");
      }

      // **The reader is what makes this unreachable rather than merely
      // unused**: the handler holds `() => ProfileReport | null` and there is
      // no recorder behind it to call.
      expect(setTierCalls, `no tier raised at ${tier}`).toEqual([]);
    }
  });

  it("T1.67 (C23 I68, C05 §3): the manifest's `section` values are C28's `SECTIONS`, written down at L0 and held equal here", () => {
    // L0 may not import L4, so `framework.ts` carries the three names as
    // literals; this is the row that fails the day either list moves. **It has
    // now fired once in anger**: the panes became a deck and the enum was four
    // pane names, so the rename travelled through this row rather than through
    // a reader noticing.
    const row = FRAMEWORK_TOOLS.find((t) => t.name === "profile");
    expect(row?.local).toBe(true);
    expect(row?.args.map((a) => [a.name, a.type, a.required])).toEqual([
      ["section", "enum", false],
      ["card", "string", false],
    ]);
    // **The three sections and the three verbs, in that order.** The enum is
    // one argument holding two kinds of value — a section appends its whole
    // deck, `snapshot` and `live` append one card (C23 I69, amended), `capture`
    // takes a CPU profile (C28 I64) — and the row holds every half rather than
    // the sections alone, because an equality against `SECTIONS` would have
    // gone green the day a verb was dropped from the enum and left the
    // completion menu short of it.
    expect([...(row?.args[0]?.values ?? [])]).toEqual([...SECTIONS, "snapshot", "live", "capture"]);
    expect(FRAMEWORK_TOOLS.map((t) => t.name).sort()).toEqual(EIGHT);
  });

  it("T4.66 (C23 I68, C23 I27): a real pipeline over the framework's rows — `/profile framework` appends the section's deck as one entry, and `seal()` accepted the eight", async () => {
    // Constructing the harness is the I27 assertion: `seal()` runs inside it
    // and refuses a row without a handler or a handler without a row.
    //
    // **The harness hands a report, not a view** (R-EXA-082, F1254): `/profile`
    // reads `() => ProfileReport | null` and there is nothing left to push.
    const { profiler } = spiedProfiler("spans");
    const h = pipelineHarness({ profile: () => profiler.report() });
    h.pipeline.submit("/profile framework");
    await settled(h.pipeline);

    expect(h.transcript.entries).toHaveLength(1);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    // The route's own `step-2` echo of the verb sits above the handler's
    // document (C23 §4), so the deck's panels are what carry the `profile-` ids.
    expect(panelIds(blocks), "the section C05 parsed, not `argv[0]` re-read").toEqual(
      idsOf("framework"),
    );
    const tree = walk(blocks);
    expect(
      tree.filter((n) => n.id !== undefined && n.id.startsWith("card-")).length,
      "and the deck reached the transcript, framed card by card",
    ).toBe(cardsOf("framework").length);
  });

  it("T4.67 (C23 I68): the same pipeline from a session with no profiler → `/profile` appends the refusal naming `TuiConfig.profile`, and no deck", async () => {
    // No `profile` on the script, which is a session built without
    // `TuiConfig.profile` — the reader folds to `() => null` in `execution.ts`.
    const h = pipelineHarness();
    h.pipeline.submit("/profile");
    await settled(h.pipeline);

    expect(h.transcript.entries).toHaveLength(1);
    expect(panelIds(h.transcript.entries[0]?.doc.blocks ?? []), "no deck").toEqual([]);
    const found = notices(h.transcript.entries[0]?.doc.blocks ?? []).filter(
      (n) => n.id?.startsWith("profile") === true,
    );
    expect(found, "one notice of the handler's, beside the route's echo").toHaveLength(1);
    expect(found[0]?.tone).toBe("warn");
    expect(found[0]?.text).toMatch(/TuiConfig\.profile/u);
  });
});

// C28 §3c — the capture verb (§9b S20).
describe("C28 I64 — the capture verb", () => {
  it("T1.128 (C28 I64, C28 I18): below `deep` it names the tier and takes it from nobody", async () => {
    for (const tier of ["off", "counters", "spans"] as const) {
      const { profiler, setTierCalls } = spiedProfiler(tier);
      let taken = 0;
      const handlers = shippedHandlers(
        deps(() => profiler.report(), async (ms) => {
          taken += 1;
          return Promise.resolve({
            kind: "cpu" as const, path: "/x.cpuprofile", bytes: 1, truncated: false,
            droppedBytes: 0, durationMs: ms, abandoned: false, stacks: null,
          });
        }),
      );
      const out = await run(handlers, ["capture"], { section: "capture" });
      const text = JSON.stringify(out.blocks);
      expect(text, `\`${tier}\` is named in the refusal`).toContain(`\`${tier}\``);
      expect(text, "and `deep` is named as what it needs").toContain("deep");
      // **The two counts are the row.** A verb that raised to serve itself
      // would produce a capture and pass every assertion about the sentence —
      // and would have reset the ring every figure on the deck is drawn from.
      expect(setTierCalls, `no tier was taken at \`${tier}\``).toEqual([]);
      expect(taken, "and no capture was attempted").toBe(0);
    }
  });

  it("T1.128b (C28 I64): at `deep` it captures, and says where the file went", async () => {
    const { profiler, setTierCalls } = spiedProfiler("deep");
    const windows: number[] = [];
    const handlers = shippedHandlers(
      deps(() => profiler.report(), async (ms) => {
        windows.push(ms);
        return Promise.resolve({
          kind: "cpu" as const, path: "/tmp/t.cpuprofile", bytes: 9, truncated: false,
          droppedBytes: 0, durationMs: ms, abandoned: false,
          stacks: {
            root: { name: "(root)", at: null, self: 0, total: 3_000, children: [] },
            excluded: { "(idle)": 7_000 },
            foldMs: 0,
          },
        });
      }),
    );
    const out = await run(handlers, ["capture"], { section: "capture" });
    const text = JSON.stringify(out.blocks);
    expect(windows, "the ask, which is the second positional's job").toEqual([400]);
    // **And the sentence names the measured window, not the ask.** The two
    // differ — `setTimeout` is a floor and V8's deltas describe what elapsed,
    // 700 asked against 839 sampled under the running TUI — so a notice that
    // printed the ask beside shares of the real window read as 140 + 699 of 700.
    expect(text, "the measured window").toContain("captured over 400 ms");
    expect(text, "the file, so the reader can find it").toContain("/tmp/t.cpuprofile");
    expect(text, "what landed on the tree").toContain("3.00 ms");
    expect(text, "and what did not").toContain("7.00 ms");
    expect(setTierCalls, "still nobody's tier").toEqual([]);

    // The window is read from the second positional and clamped to the bounds
    // the handler states — 20 is under the floor, and a floor that let it
    // through would return a window with too few samples to be a distribution.
    await run(handlers, ["capture", "20"], { section: "capture", card: "20" });
    expect(windows.at(-1), "clamped up to the floor").toBe(50);
  });
});
