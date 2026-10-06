// C22 I135–I139 and C16 I76–I77 — the watch set, the verbs, the footer's row and
// the row's keys, each alone (ruling 50, §085, C22 §6p, C16 §6d).
//
// **Each piece over the real thing next to it**: the store over a real
// transcript, the handlers over a real store, the row through C09's real
// measurer. A fake transcript would answer `streaming` however the row wanted.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { makeDefaultChrome, watchRowChips } from "../../src/shell/chrome.js";
import { createWatches, watchItem } from "../../src/shell/watches.js";
import { shippedHandlers, type HandlerDeps } from "../../src/shell/local/handlers.js";
import type { LocalContext } from "../../src/shell/local/registry.js";
import type { WatchRowState } from "../../src/shell/types.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import type { TranscriptStore } from "../../src/viewport/transcript/types.js";
import { activeTarget, createFocusStore, FOCUS_ORDER, resolveWatch } from "../../src/interaction/router/focus.js";
import { RUNG_OF } from "../../src/interaction/router/types.js";
import { defaultKeymap } from "../../src/interaction/router/keymap.js";
import { glyphFor, glyphs } from "../../src/presentation/blocks/glyphs.js";
import { barStyle } from "../../src/presentation/blocks/index.js";
import type { Block, Notice, ViewDocument } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { doc } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

const WIDE_CAPS: TerminalCapabilities = Object.freeze({ ...FULL_CAPS, ambiguousWidth: "wide" });

/** A document named as the reader typed it, with its transport and origin. */
const run = (
  command: string,
  over: Partial<Readonly<{ transport: string; origin: string; blocks: readonly Block[] }>> = {},
): ViewDocument =>
  doc({
    command,
    blocks: (over.blocks ?? []) as Block[],
    meta: {
      verb: command.split(" ")[0] ?? command,
      adapter: "passthrough",
      exitCode: 0,
      durationMs: 12,
      truncated: false,
      argv: command.split(" "),
      stderr: "",
      transport: (over.transport ?? "subprocess") as never,
      origin: (over.origin ?? "user") as never,
    },
  });

const storeOver = (t: TranscriptStore) => createWatches((id) => t.entries.find((e) => e.id === id));

describe("C22 §6p — watches, each piece alone (ruling 50)", () => {
  // Three watches, the second with a progress block at 43 / 100. The names are
  // chosen so the four widths land on the four rungs of I138's ladder: all
  // bars fit at 80 (64 cells), none at 60 (57 without), a `+N` at 40, and
  // the kept name cut at 20 — **the fixture is shown to respond** by asserting
  // each rung's own evidence rather than only the width.
  const items: WatchRowState["items"] = [
    { id: "e1", name: "make build --all" },
    { id: "e2", name: "ps --watch", progress: { current: 43, total: 100 } },
    { id: "e3", name: "tail -f /var/log/app" },
  ];
  const chrome = makeDefaultChrome("prism", "prism");
  const chordOf = (target: string, action: string) =>
    defaultKeymap.find((b) => b.target === target && b.action === action && b.profile !== "enhanced-terminal")?.key;
  const footer = (caps: TerminalCapabilities, columns: number, watches: WatchRowState | undefined, watchRow?: "present" | "focused") =>
    chrome.footer({
      session: { cwd: "/work", env: {}, lastUuid: null, identity: null, cluster: "c", health: "live", version: "1", retained: null, stopping: false },
      now: 0,
      columns,
      owner: "scope",
      capabilities: caps,
      hints: { chord: chordOf as never, ...(watchRow === undefined ? {} : { watchRow }) },
      ...(watches === undefined ? {} : { watches }),
    });
  const labels = (b: Block | undefined): readonly string[] => (b !== undefined && b.kind === "pills" ? b.chips.map((c) => c.label) : []);

  it("T1.78 (C22 I137, I138, I139): the footer's watch row at 80, 60, 40 and 20 columns, ASCII and wide, and the scope line's ⇧⇥ label", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS, WIDE_CAPS]) {
      const m = measurable({ capabilities: caps });
      const bar = barStyle(caps);
      const lead = glyphs(caps).residue;
      for (const columns of [80, 60, 40, 20]) {
        const blocks = footer(caps, columns, { items, selected: null });
        const at = blocks.findIndex((b) => b.id === "chrome.watches");
        expect(at, `${String(columns)}: one watch row`).toBeGreaterThanOrEqual(0);
        expect(blocks.filter((b) => b.id === "chrome.watches")).toHaveLength(1);
        expect(blocks[at + 1]?.id, `${String(columns)}: directly above the owner line (ruling 4)`).toBe("chrome.owner");
        const row = blocks[at]!;
        expect(m.measure(row, columns), `${String(columns)} ${caps.unicode}/${caps.ambiguousWidth}: one row`).toBe(1);
        const text = labels(row);
        expect(text[0], "the lead is C09's residue glyph").toBe(lead);
        expect(text.join(" "), "no selection, no current mark").not.toContain(glyphFor("current", caps));
        if (columns === 80) {
          expect(text[2], "the second chip carries the bar and C09's percentage").toBe(
            `ps --watch ${bar.on.repeat(3)}${bar.off.repeat(3)} 43%`,
          );
          expect(text).toHaveLength(4);
        }
        if (columns === 60) {
          expect(text.join(" "), "no bar glyph is drawn").not.toContain(bar.on.repeat(3));
          // **Every watch still stands, and no `+N`**: bars are the first thing
          // given up (C22 I138). A length check alone passed a row that shed a watch
          // instead — lead, two chips and a `+1` is also four (the mutation pass).
          expect(text, "and every percentage is, with every watch").toEqual([
            lead,
            "make build --all",
            "ps --watch 43%",
            "tail -f /var/log/app",
          ]);
        }
        if (columns === 40) {
          expect(text.some((l) => /^\+\d+$/u.test(l)), "a `+N` chip stands").toBe(true);
          expect(text[1], "the oldest is kept when nothing is selected").toBe("make build --all");
        }
        if (columns === 20) {
          expect(text[1], "the kept name is cut").not.toBe("make build --all");
          expect(text[2]).toBe("+2");
        }
      }
      // The selected watch is kept at 40, with the mark and the accent tone.
      const picked = watchRowChips({ items, selected: 2 }, 40, caps);
      const mark = glyphFor("current", caps);
      expect(picked.map((c) => c.label), "the selection survives shedding").toContain(`${mark} tail -f /var/log/app`);
      expect(picked.filter((c) => c.tone === "accent")).toHaveLength(1);
      expect(watchRowChips({ items, selected: null }, 80, caps).some((c) => c.tone === "accent"), "selected: null draws no accent").toBe(false);
      // The row focused with nothing left in it (R-COR-002).
      expect(watchRowChips({ items: [], selected: null }, 80, caps).map((c) => c.label)).toEqual([lead, "nothing watched"]);
    }
    // The scope line: `⇧⇥` says where it goes (C22 I139).
    const owner = (watchRow?: "present" | "focused") =>
      labels(footer(FULL_CAPS, 80, watchRow === undefined ? undefined : { items, selected: watchRow === "focused" ? 0 : null }, watchRow).find((b) => b.id === "chrome.owner"));
    expect(owner("present").some((l) => l.endsWith(" watches")), "one watch: ⇧⇥ watches").toBe(true);
    expect(owner().some((l) => l.endsWith(" transcript")), "none: ⇧⇥ transcript").toBe(true);
    expect(owner("present").some((l) => l.endsWith(" transcript")), "and never both").toBe(false);
    const focused = owner("focused");
    for (const word of ["move", "open", "prompt"]) expect(focused.some((l) => l.endsWith(` ${word}`)), word).toBe(true);
    expect(focused.some((l) => l.endsWith(" send")), "the prompt's keys reach nothing from the row").toBe(false);
    // No watches at all: no row (the control for the first assertion above).
    expect(footer(FULL_CAPS, 80, undefined).some((b) => b.id === "chrome.watches")).toBe(false);
    // The ASCII lead, bar and selection mark, by value (K3) — and the wide
    // rung is C09's ASCII table, because `›` and `⋯` would be two cells there.
    expect([glyphs(ASCII_CAPS).residue, glyphFor("current", ASCII_CAPS)]).toEqual(["...", "*"]);
    expect(barStyle(ASCII_CAPS)).toMatchObject({ on: "#", off: "-" });
    expect(glyphs(WIDE_CAPS).residue).toBe("...");
    expect(glyphFor("current", WIDE_CAPS)).toBe("*");
  });

  it("T1.79 (C22 I135): the store — streaming only, idempotent in order, unwatch answers, clear and settle drop", () => {
    const t = createTranscriptStore();
    const s = storeOver(t);
    const a = t.append(run("make"), { streaming: true });
    const b = t.append(run("tail"), { streaming: true });
    const done = t.append(run("ls"));
    expect(s.watch(a), "a streaming entry").toBe(true);
    expect(s.watch(done), "a settled one").toBe(false);
    expect(s.watch("nope"), "an unknown id").toBe(false);
    expect(s.watch(b)).toBe(true);
    expect(s.watch(a), "again").toBe(true);
    expect(s.ids(), "and the order is when each was first watched").toEqual([a, b]);
    expect(s.unwatch(done), "unwatch answers whether it removed one").toBe(false);
    expect(s.unwatch(b)).toBe(true);
    expect(s.ids()).toEqual([a]);
    expect(s.watch(b)).toBe(true);

    // A settle drops that one alone — and `settled` on a still-streaming id is a no-op.
    s.settled(a);
    expect(s.ids(), "an append arriving here drops nothing").toEqual([a, b]);
    t.settle(a);
    s.settled(a);
    expect(s.ids()).toEqual([b]);
    expect(s.has(a)).toBe(false);
    // A clear drops every watch.
    s.clear();
    expect(s.ids()).toEqual([]);

    // The item the row draws: the first progress, depth first; the name as typed.
    const nested = t.append(
      run("deploy", {
        blocks: [
          { kind: "group", id: "g", direction: "column", children: [{ kind: "progress", id: "p", label: "x", current: 3, total: 4 }] },
          { kind: "progress", id: "q", label: "y", current: 1, total: 4 },
        ] as never,
      }),
      { streaming: true },
    );
    const entry = t.entries.find((e) => e.id === nested)!;
    expect(watchItem(entry)).toEqual({ id: nested, name: "deploy", progress: { current: 3, total: 4 } });
  });

  it("T1.80 (C22 I136): the two handlers, one row per line of §6p.2's table", async () => {
    const t = createTranscriptStore();
    const watches = storeOver(t);
    const deps = {
      transcript: t,
      watches,
    } as unknown as HandlerDeps;
    const h = shippedHandlers(deps);
    const call = async (verb: "watch" | "unwatch", argv: readonly string[] = []): Promise<Notice> => {
      const handler = h[verb];
      if (handler === undefined) throw new Error(`no ${verb} handler`);
      const out = await handler(argv, {} as LocalContext);
      const n = out.blocks.find((b): b is Notice => b.kind === "notice");
      if (n === undefined) throw new Error(`/${verb} returned no notice`);
      return n;
    };
    const said = async (verb: "watch" | "unwatch", argv: readonly string[] = []) => {
      const n = await call(verb, argv);
      return [n.tone, n.text] as const;
    };

    // Nothing running at all.
    expect(await said("watch")).toEqual(["warn", "nothing is running to watch"]);
    expect(await said("unwatch")).toEqual(["warn", "nothing is watched"]);

    // Only a queued line is streaming: the default skips `transport: "local"`.
    const queued = t.append(run("/slow", { transport: "local" }), { streaming: true });
    expect(await said("watch"), "a queued line is not a run").toEqual(["warn", "nothing is running to watch"]);

    // A stream beneath the queued line — the default finds it, not the queued line.
    const stream = t.append(run("tail -f log", { origin: "user" }), { streaming: true });
    const again = t.append(run("/quick", { transport: "local" }), { streaming: true });
    expect(await said("watch"), "the stream beneath the queued line").toEqual(["muted", "watching tail -f log"]);
    expect(watches.ids()).toEqual([stream]);
    expect(await said("watch"), "already watched").toEqual(["muted", "already watching tail -f log"]);
    expect(watches.ids(), "order unchanged").toEqual([stream]);

    // Named: a queued line is the reader's choice (3 back is `queued`).
    expect(await said("watch", ["3"])).toEqual(["muted", "watching /slow"]);
    expect(watches.ids()).toEqual([stream, queued]);
    void again;

    // An agent's stream is watched with the same words: origin never gates.
    const agent = t.append(run("build all", { origin: "agent" }), { streaming: true });
    expect(await said("watch")).toEqual(["muted", "watching build all"]);
    expect(watches.has(agent)).toBe(true);

    // Named, settled; named, past the transcript.
    const ended = t.append(run("ls"));
    expect(await said("watch", ["1"])).toEqual(["warn", "ls has settled — nothing left to watch"]);
    expect(await said("watch", ["99"])).toEqual(["warn", `no entry 99 back — the transcript holds ${String(t.entries.length)}`]);
    void ended;

    // `/unwatch`: the newest by default; named, not watched; named, watched.
    expect(await said("unwatch")).toEqual(["muted", "stopped watching build all"]);
    expect(await said("unwatch", ["1"])).toEqual(["warn", "ls is not watched"]);
    expect(await said("unwatch", ["5"])).toEqual(["muted", "stopped watching /slow"]);
    expect(watches.ids()).toEqual([stream]);
    expect(await said("unwatch", ["99"])).toEqual(["warn", `no entry 99 back — the transcript holds ${String(t.entries.length)}`]);
  });
});

describe("C16 §6d — the watch row's target and keys (ruling 50)", () => {
  it("T1.198 (C16 I76): activeTarget answers watchRow, the rung is scope, and the selection resolves by id then index", () => {
    const focus = createFocusStore();
    focus.toWatches("b", 1);
    expect(focus.current).toEqual({ at: "watches", id: "b", index: 1 });
    const inputs = { overlayTop: null, nativeSelection: false, semanticSelection: false, attachedChild: false, liveEntry: null };
    expect(activeTarget({ ...inputs, stored: focus.current })).toBe("watchRow");
    focus.reset();
    expect(activeTarget({ ...inputs, stored: focus.current })).toBe("prompt");
    expect(RUNG_OF.watchRow).toBe("scope");
    const at = FOCUS_ORDER.indexOf("watchRow");
    expect(FOCUS_ORDER[at - 1]).toBe("prompt");
    expect(FOCUS_ORDER[at + 1]).toBe("liveBlock");

    const sel = { id: "b", index: 1 };
    expect(resolveWatch(sel, ["a", "c"]), "gone: its index, which is `c`").toBe(1);
    expect(resolveWatch(sel, ["a", "b", "c"]), "by id").toBe(1);
    expect(resolveWatch(sel, ["b", "a", "c"]), "by id, wherever it moved").toBe(0);
    expect(resolveWatch(sel, ["a"]), "clamped").toBe(0);
    expect(resolveWatch(sel, []), "an empty row selects nothing").toBe(null);
  });

  it("T1.199 (C16 I77, I76): the row's rows are §6d's, collide in neither profile, and watch.jump.* is 1–9 default-terminal alone", () => {
    const row = defaultKeymap.filter((b) => b.target === "watchRow");
    const actions = new Set(row.map((b) => b.action));
    expect([...actions].sort()).toEqual(
      [
        "watchPrev",
        "watchNext",
        "watchOpen",
        "focusPrompt",
        "focusTranscript",
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `watchJump${String(n)}`),
      ].sort(),
    );
    // No duplicate slot in either profile.
    for (const profile of ["default-terminal", "enhanced-terminal"]) {
      const seen = new Set<string>();
      for (const b of row.filter((r) => r.profile === undefined || r.profile === profile)) {
        const slot = JSON.stringify(b.key);
        expect(seen.has(slot), `${profile}: ${slot} bound twice at the row`).toBe(false);
        seen.add(slot);
      }
    }
    const registry = JSON.parse(readFileSync(new URL("../../docs/design/language/calcium-registry.json", import.meta.url), "utf8")) as {
      bindings: readonly Readonly<{ actionId: string; chord: string; scope: string; profile: string; when?: string; status: string }>[];
    };
    const jumps = registry.bindings.filter((b) => b.actionId.startsWith("watch.jump."));
    expect(jumps.map((b) => b.chord).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    for (const b of jumps) {
      expect(b.profile).toBe("default-terminal");
      expect(b.scope).toBe("global");
      expect(b.when).toBe("focused");
    }
    expect(jumps.some((b) => b.profile === "enhanced-terminal"), "no direct chord").toBe(false);
    // No keymap row at `global` or `prompt` binds a bare digit.
    const bareDigit = (k: unknown) => {
      const key = k as { name?: string; ctrl?: boolean; meta?: boolean; alt?: boolean; super?: boolean };
      return typeof key.name === "string" && /^[1-9]$/u.test(key.name) && !key.ctrl && !key.meta && !key.alt && !key.super;
    };
    const stray = defaultKeymap.filter((b) => (b.target === "global" || b.target === "prompt") && bareDigit(b.key));
    expect(stray).toEqual([]);
    // The control: the row itself does bind them.
    expect(row.filter((b) => bareDigit(b.key))).toHaveLength(9);
  });
});
