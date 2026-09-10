// C23 — `/profile [pane]`, the seventh shipped local verb
// (docs/components/C23_execution_pipeline.md §2, §10), tier 1.
//
// **Driven through `shippedHandlers` with a view handed in, and through a real
// pipeline over the framework's rows.** `HandlerDeps.profileView` is required:
// the `profile` row is in `FRAMEWORK_TOOLS` and C23 I27 refuses a row without a
// handler at every startup, so the view arrives whether or not a recorder does
// and refuses through the route when none does (T4.67). T1.64's second arm
// watched the transitional conditional that preceded this; it now asserts the
// handler is present whatever the view answers.
import { describe, expect, it } from "vitest";

import { FRAMEWORK_TOOLS } from "../../src/data/manifest/framework.js";
import type { Block, LocalDocument, Notice } from "../../src/data/viewmodel/index.js";
import { shippedHandlers } from "../../src/shell/local/handlers.js";
import type { HandlerDeps } from "../../src/shell/local/handlers.js";
import type { LocalContext } from "../../src/shell/local/registry.js";
import type { ProfileView } from "../../src/shell/profile-view.js";
import { PANES } from "../../src/shell/profiling/panes.js";
import type { PaneName } from "../../src/shell/profiling/panes.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { producerContext } from "../support/producer-context.js";

/** A view that records what it was asked to open, and answers as told. */
const fakeView = (
  refuse: string | null = null,
): { view: ProfileView; opened: (PaneName | undefined)[] } => {
  const opened: (PaneName | undefined)[] = [];
  const view: ProfileView = {
    open: (pane) => {
      opened.push(pane);
      return refuse;
    },
    switchPane: () => false,
    move: () => false,
    pop: () => false,
    dispose: () => undefined,
    // Open on the last pane asked for, unless every open was refused — the
    // shape the real view has, reduced to what these rows read.
    get pane(): PaneName | null {
      return refuse === null ? ((opened.at(-1) ?? null) as PaneName | null) : null;
    },
  };
  return { view, opened };
};

const deps = (view: ProfileView = fakeView().view): HandlerDeps => ({
  manifest: () => null,
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
  profileView: view,
});

const ctx = (args: Readonly<Record<string, unknown>> = {}): LocalContext => ({
  ...producerContext(),
  command: "/profile",
  ask: () => Promise.resolve(""),
  args,
});

const NO_PROFILER = "no profiler to show — this session was built without `TuiConfig.profile`";

/** The six the framework shipped before this round, by key. */
const SIX = ["clear", "debug", "exit", "help", "history", "theme"];
const SEVEN = [...SIX, "profile"].sort();

const run = async (
  handlers: Readonly<Record<string, (argv: readonly string[], c: LocalContext) => LocalDocument | Promise<LocalDocument>>>,
  argv: readonly string[],
  args: Readonly<Record<string, unknown>> = {},
): Promise<LocalDocument> => {
  const handler = handlers["profile"];
  if (handler === undefined) throw new Error("no `profile` handler in the map");
  return handler(argv, ctx(args));
};

const notices = (blocks: readonly Block[]): readonly Notice[] =>
  blocks.filter((x): x is Notice => x.kind === "notice");

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

describe("C23 — /profile, the local route", () => {
  it("T1.64 (C23 I68, C23 I27): a refusal from the view is a `warn` notice on the route, and the handler is one of seven whatever the view answers", async () => {
    // Arm 1: the view refuses naming `TuiConfig.profile` (C28 T1.97's string)
    // and the verb answers in a document rather than throwing.
    const { view, opened } = fakeView(NO_PROFILER);
    const handlers = shippedHandlers(deps(view));
    expect(Object.keys(handlers).sort()).toEqual(SEVEN);

    const doc = await run(handlers, []);
    const found = notices(doc.blocks);
    expect(found).toHaveLength(1);
    expect(found[0]?.tone).toBe("warn");
    expect(found[0]?.text).toMatch(/TuiConfig\.profile/u);
    expect(opened, "the view was asked once, for the default pane").toEqual(["overview"]);

    // **Arm 2: the handler does not depend on the view's answer.** A view that
    // accepts yields the same seven keys — the row is in `FRAMEWORK_TOOLS`, so a
    // map that dropped `profile` on any condition is what C23 I27 refuses at
    // startup. (This arm watched the transitional conditional until the row
    // landed; the six-without-`profile` shape is now unconstructible.)
    const accepting = shippedHandlers(deps(fakeView().view));
    expect(Object.keys(accepting).sort()).toEqual(SEVEN);
    expect(accepting).toHaveProperty("profile");
  });

  it("T1.65 (C23 I68, C22 I66): the pane comes from `args`, and a token that is not a pane gets a usage notice", async () => {
    const { view, opened } = fakeView();
    const handlers = shippedHandlers(deps(view));

    // `/profile frame`, as C05 hands it over: parsed into `args`.
    const ok = await run(handlers, ["frame"], { pane: "frame" });
    expect(opened).toEqual(["frame"]);
    expect(notices(ok.blocks).map((n) => n.text)).toEqual(["profiler: frame"]);

    // `/profile foo`: validation failed, so `args` is empty and `argv` carries
    // the token. Usage names all four panes and quotes what was typed.
    const bad = await run(handlers, ["foo"]);
    expect(opened, "the view was not asked").toEqual(["frame"]);
    const usage = notices(bad.blocks);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.tone).toBe("warn");
    for (const pane of PANES) expect(usage[0]?.text).toContain(pane);
    expect(usage[0]?.text).toContain("`foo`");

    // **The pane is asserted to come from `args`**: `argv[0]` says one thing
    // and `args.pane` another, and a handler reading `argv` would open the
    // wrong pane while passing both arms above.
    await run(handlers, ["memory"], { pane: "frame" });
    expect(opened.at(-1)).toBe("frame");
  });

  it("T1.66 (C23 I69): the document names the pane and carries none of it", async () => {
    const { view } = fakeView();
    const doc = await run(shippedHandlers(deps(view)), ["distribution"], { pane: "distribution" });

    const tree = walk(doc.blocks);
    expect(tree.filter((n) => n.kind === "notice"), "one notice").toHaveLength(1);
    expect(tree.filter((n) => n.kind === "plot"), "no plot anywhere in the tree").toEqual([]);
    const paneIds = tree.filter((n) => n.id !== undefined && /^(ov|fr|di|me)-/u.test(n.id));
    expect(paneIds, "no block of any pane's").toEqual([]);
    expect(notices(doc.blocks)[0]?.text).toBe("profiler: distribution");
  });

  it("T1.67 (C23 I68, C05 §3): the manifest's `pane` values are C28's `PANES`, written down at L0 and held equal here", () => {
    // L0 may not import L4, so `framework.ts` carries the four names as
    // literals; this is the row that fails the day either list moves.
    const row = FRAMEWORK_TOOLS.find((t) => t.name === "profile");
    expect(row?.local).toBe(true);
    expect(row?.args.map((a) => [a.name, a.type, a.required])).toEqual([["pane", "enum", false]]);
    expect([...(row?.args[0]?.values ?? [])]).toEqual([...PANES]);
    expect(FRAMEWORK_TOOLS.map((t) => t.name).sort()).toEqual(SEVEN);
  });

  it("T4.66 (C23 I68, C23 I27): a real pipeline over the framework's rows — `/profile frame` opens the view on `frame`, appends one notice and nothing of the panes, and `seal()` accepted the seven", async () => {
    const { view, opened } = fakeView();
    // Constructing the harness is the I27 assertion: `seal()` runs inside it
    // and refuses a row without a handler or a handler without a row.
    const h = pipelineHarness({ profileView: view });
    h.pipeline.submit("/profile frame");
    await settled(h.pipeline);

    expect(opened, "the pane C05 parsed, not `argv[0]` re-read").toEqual(["frame"]);
    expect(view.pane).toBe("frame");
    expect(h.transcript.entries).toHaveLength(1);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    // The route's own `step-2` echo of the verb sits above the handler's
    // document (C23 §4), so the handler's notice is the one carrying its id.
    const own = notices(blocks).filter((n) => n.id?.startsWith("profile") === true);
    expect(own, "one notice of the handler's").toHaveLength(1);
    expect(own[0]?.text).toBe("profiler: frame");
    const tree = walk(blocks);
    expect(tree.filter((n) => n.id !== undefined && /^(ov|fr|di|me)-/u.test(n.id)), "none of the panes").toEqual([]);
    expect(tree.filter((n) => n.kind === "plot"), "no plot anywhere in the entry").toEqual([]);
  });

  it("T4.67 (C23 I68): the same pipeline from a session with no profiler → `/profile` appends the refusal naming `TuiConfig.profile`, and nothing is open", async () => {
    const { view, opened } = fakeView(NO_PROFILER);
    const h = pipelineHarness({ profileView: view });
    h.pipeline.submit("/profile");
    await settled(h.pipeline);

    expect(opened, "asked, for the default pane, and refused").toEqual(["overview"]);
    expect(view.pane).toBeNull();
    expect(h.transcript.entries).toHaveLength(1);
    const found = notices(h.transcript.entries[0]?.doc.blocks ?? []).filter(
      (n) => n.id?.startsWith("profile") === true,
    );
    expect(found, "one notice of the handler's, beside the route's echo").toHaveLength(1);
    expect(found[0]?.tone).toBe("warn");
    expect(found[0]?.text).toMatch(/TuiConfig\.profile/u);
  });
});
