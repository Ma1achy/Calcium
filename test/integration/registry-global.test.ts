// C16 I66 and I67 — where a registry-global binding fires, and the exact ⌃c
// (§6c tables B and the trace). Through a built session, because a placement is
// only true of the owner a real dispatch reaches.
//
// **Bytes into stdin, not events into the router.** A placement is a claim about
// the decoder and the ladder together: `⌥⇧C` is `ESC C`, which names a capital
// and sets no shift bit, and a row built from `{name: "c", meta, shift}` would
// resolve against a key no terminal sends.
//
// Fail-on-revert, each naming the change:
//
//   - `?` bound at `liveBlock` alone again (T6.46) → T4.85 fails at
//     `semanticSelection` and `interaction`, which have no row and no `global`
//     one to pass to.
//   - The `liveBlock` copy row deleted (T6.50) → T4.86 fails at the focused
//     block: the kill buffer holds nothing.
//   - The copy-mode switch removed from `session.ts` (T6.52) → T4.89 fails with
//     both modes on: `COPY` survives native selection's exit.
//   - `isCtrlC` in the router ignoring shift again (T6.48) → T4.87 fails: kitty
//     `⌃⇧C` cancels the verb in flight.
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGraph, buildSession, COPY_MODES, FRAME, MANIFEST } from "../support/session.js";
import type { ManifestDocument } from "../../src/data/manifest/types.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { MENU_ID } from "../../src/interaction/completion/index.js";
import { SEARCH_ID } from "../../src/interaction/history/index.js";
import type { Graph } from "../../src/shell/construct.js";

const ESC = "\u001b";
const DOWN = `${ESC}[B`;
const ALT_W = `${ESC}w`;
/** Kitty's `⌃⇧C`: codepoint 99, modifiers 1 + shift + ctrl. */
const KITTY_CTRL_SHIFT_C = `${ESC}[99;6u`;
const CTRL_C = "\u0003";

const META = {
  adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false,
  argv: [] as string[], stderr: "", transport: "local", origin: "user",
};

const TABLE = {
  kind: "table",
  id: "t",
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 4, sortable: false }],
  rows: [
    { id: "r1", cells: { name: { text: "api" } } },
    { id: "r2", cells: { name: { text: "worker" } } },
  ],
};

/** A block with an inside: a camera is what declares view state (C26 I26). */
const PLOT = {
  kind: "plot", id: "camera-plot", form: "line", height: 3, camera: { azimuth: 0 },
  series: [{ label: "s", values: [1, 2, 3] }],
};

const FORM = {
  kind: "form",
  id: "f",
  fields: [
    { id: "name", label: "name", value: "prism-serve" },
    { id: "port", label: "port", value: "80" },
  ],
  buttons: [{ id: "cancel", label: "cancel" }],
};

const REPLYABLE = [
  { key: "n", label: "no", default: true as const },
  { key: "r", label: "reply…", reply: true as const },
];

afterEach(() => {
  COPY_MODES.native = false;
  COPY_MODES.semantic = false;
  vi.restoreAllMocks();
});

async function world(kitty = false) {
  const built = await buildGraph(kitty ? { capabilities: { keyboardProtocol: "kitty" } as never } : {});
  built.graph.lifecycle.acquire();
  const graph = built.graph;
  /** Bytes, then long enough for a local verb's entry to land. */
  const type = async (bytes: string): Promise<void> => {
    built.stdin.emit(bytes);
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  const append = (command: string, blocks: readonly unknown[]): void =>
    void graph.transcript.append(
      { schema: "tui.view/1", command, status: "ok", blocks, meta: { verb: command.slice(1), ...META } } as never,
      { streaming: true },
    );
  const helps = () => graph.transcript.entries.filter((e) => e.doc.command === "/help keys");
  /** The rung the help entry says the reader is on — its first heading. */
  const here = (): string | undefined => {
    const doc = helps().at(-1)?.doc;
    const rule = doc?.blocks.find((b) => b.kind === "rule") as { label?: string } | undefined;
    return rule?.label;
  };
  return { graph, type, append, helps, here, stdin: built.stdin };
}

/** Focus in the transcript, reached by the key a reader presses. */
async function inBlock(w: Awaited<ReturnType<typeof world>>): Promise<void> {
  w.append("/ps", [TABLE]);
  await w.type(DOWN);
  expect(w.graph.focus.current.at, "↓ from an empty prompt reaches the block").toBe("liveBlock");
}

/** Inside a block, as `⏎` on an element with view state enters it. */
async function inside(w: Awaited<ReturnType<typeof world>>): Promise<void> {
  w.append("/plot", [PLOT]);
  await w.type(DOWN);
  await w.type("\r");
  const f = w.graph.focus.current;
  expect(f.at === "liveBlock" && f.mode === "interact", "⏎ on the plot went inside").toBe(true);
}

/** A question whose `reply…` is chosen, so a line is composed under it (C23 I73). */
async function replying(graph: Graph, type: (b: string) => Promise<void>): Promise<void> {
  void graph.confirm.ask({ question: "why?", choices: REPLYABLE });
  await new Promise((r) => setTimeout(r, 0));
  // At most twice: a newly raised owner refuses its first activation (C16 I44).
  for (let i = 0; i < 2 && graph.confirm.replacing !== null; i += 1) await type("r");
  expect(graph.confirm.replacing, "reply… chosen").toBeNull();
}

describe("C16 §6c — the registry-global bindings, per owner (review batch 2, M6 item 4)", () => {
  it("T4.85 (C16 I66, I52, R-KEY-005): ? types at every typing owner, appends one help entry where no line is composed, nothing at native selection, and the entry is the profile's", async () => {
    // --- typed, at every owner composing a line (§6c table B's `?` column) ---
    {
      const w = await world();
      await w.type("?");
      expect(w.graph.editor.text, "the prompt types it").toBe("?");
      expect(w.helps(), "and no help entry").toHaveLength(0);
    }
    {
      const w = await world();
      await w.type("/");
      expect(w.graph.overlays.stack.map((l) => l.id), "`/` opened the menu").toContain(MENU_ID);
      await w.type("?");
      expect(w.graph.editor.text, "the menu's prompt types it").toBe("/?");
      expect(w.helps()).toHaveLength(0);
    }
    {
      const w = await world();
      await w.type("\u0012");
      expect(w.graph.overlays.stack.map((l) => l.id), "⌃R opened the search").toContain(SEARCH_ID);
      await w.type("?");
      expect(w.graph.overlays.stack.map((l) => l.id), "the search is still up").toContain(SEARCH_ID);
      expect(w.helps(), "the search narrows; no help entry").toHaveLength(0);
    }
    {
      const w = await world();
      await replying(w.graph, w.type);
      await w.type("?");
      expect(w.graph.editor.text, "the reply types it").toBe("?");
      expect(w.helps()).toHaveLength(0);
    }
    {
      const w = await world();
      w.append("/form", [FORM]);
      await w.type(DOWN);
      await w.type(DOWN);
      await w.type("\r");
      await w.type("?");
      expect(w.graph.editor.text, "the field types it").toBe("80?");
      expect(w.helps()).toHaveLength(0);
    }

    // --- one entry, where no line is composed, naming where the reader is ---
    const rungs: [string, (w: Awaited<ReturnType<typeof world>>) => Promise<void>][] = [
      ["liveBlock", inBlock],
      ["interaction", inside],
      ["semanticSelection", async () => void (COPY_MODES.semantic = true)],
    ];
    for (const [rung, enter] of rungs) {
      const w = await world();
      await enter(w);
      const history = w.graph.history.entries.length;
      await w.type("?");
      expect(w.helps(), `${rung}: one help entry`).toHaveLength(1);
      expect(w.here(), `${rung}: it leads with where the reader is`).toBe(`${rung} — where you are`);
      expect(w.graph.history.entries.length, `${rung}: history unchanged`).toBe(history);
      COPY_MODES.semantic = false;
    }

    // --- nothing, where the terminal holds the selection or a question blocks ---
    {
      const w = await world();
      COPY_MODES.native = true;
      await w.type("?");
      expect(w.helps(), "native selection: the frame is frozen, so nothing is emitted").toHaveLength(0);
      expect(w.graph.router.lastStages, "captured, not passed to step 3").not.toContain("global");
      COPY_MODES.native = false;
    }
    {
      const w = await world();
      void w.graph.confirm.ask({ question: "delete?", choices: [{ key: "y", label: "yes" }, { key: "n", label: "no", default: true as const }] });
      await new Promise((r) => setTimeout(r, 0));
      await w.type("?");
      expect(w.helps(), "a blocking question: no entry").toHaveLength(0);
      expect(w.graph.confirm.open, "and the question is still open").toBe(true);
    }

    // --- the entry is the profile's (R-KEY-005, §6a clause 5) ---
    // **`⌘↑`, not `⌘1`**: the agent chords are reserved, and a reserved row with
    // no handler is not listed (C22 I134) — so `⌘1`'s absence would say nothing
    // about the profile. `transcript.top` is an ordinary action with a record
    // in each profile.
    for (const kitty of [true, false]) {
      const w = await world(kitty);
      await inBlock(w);
      await w.type("?");
      const text = JSON.stringify(w.helps().at(-1)?.doc.blocks ?? []);
      if (kitty) {
        expect(text, "a kitty session lists the enhanced chord").toContain("⌘↑");
      } else {
        expect(text, "a default session lists the base chord").toContain("⌃home");
        expect(text, "and no chord its terminal cannot send").not.toContain("⌘");
      }
    }
  });

  it("T4.86 (C16 I66): ⌥w and kitty ⌃⇧C copy at the prompt, a focused block, the inside and semantic copy", async () => {
    // **The kitty arm rests on I67**: read loosely, the intercept took
    // `CSI 99;6u` as `⌃c` and interrupted before any owner was asked — §6c S7,
    // measured.
    const CHORDS: readonly (readonly [boolean, string])[] = [[false, ALT_W], [true, KITTY_CTRL_SHIFT_C]];
    for (const [kitty, chord] of CHORDS) {
      const label = kitty ? "⌃⇧C" : "⌥w";
      {
        const w = await world(kitty);
        await w.type("git status");
        await w.type(`${ESC}a`);
        await w.type(chord);
        expect(w.graph.editor.killBuffer, `${label} at the prompt copies the selection`).toBe("git status");
        expect(w.graph.editor.text, "and leaves the line").toBe("git status");
      }
      {
        const w = await world(kitty);
        await inBlock(w);
        await w.type(chord);
        expect(w.graph.editor.killBuffer, `${label} at a focused block copies the row`).toContain("api");
      }
      {
        const w = await world(kitty);
        await inside(w);
        const before = w.graph.editor.killBuffer;
        await w.type(chord);
        expect(w.graph.editor.killBuffer, `${label} inside copies the element`).not.toBe(before);
        const f = w.graph.focus.current;
        expect(f.at === "liveBlock" && f.mode === "interact", "and stays inside").toBe(true);
      }
      {
        // **Spied before the graph is built**: the root copies the frame's
        // function onto its effect deps at construction, so a spy installed
        // after it watches a function nothing calls.
        const copied = vi.spyOn(FRAME, "copySelectedEntries");
        // Spying twice returns the same spy, so the previous chord's call is on it.
        copied.mockClear();
        const w = await world(kitty);
        COPY_MODES.semantic = true;
        await w.type(chord);
        expect(copied, `${label} in semantic copy copies the selected entries`).toHaveBeenCalledTimes(1);
        COPY_MODES.semantic = false;
      }
    }
  });

  it("T4.87 (C16 I67): kitty ⌃⇧C neither cancels a verb, arms the exit nor denies a question; 0x03 cancels on the base profile", async () => {
    /** A session with a local verb that never settles, so one can be in flight. */
    const slowWorld = async (kitty: boolean) => {
      const built = await buildGraph({
        manifest: {
          ...(MANIFEST as ManifestDocument),
          tools: [
            ...(MANIFEST as ManifestDocument).tools,
            { name: "slow", local: true, summary: "never settles", args: [], flags: [] },
          ],
        } as never,
        localHandlers: { slow: () => new Promise<never>(() => undefined) },
        ...(kitty ? { capabilities: { keyboardProtocol: "kitty" } as never } : {}),
      });
      built.graph.lifecycle.acquire();
      const type = async (bytes: string): Promise<void> => {
        built.stdin.emit(bytes);
        for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
      };
      return { graph: built.graph, type };
    };
    {
      // S7: a verb in flight survives the copy.
      const w = await slowWorld(true);
      await w.type("/slow\r");
      expect(w.graph.pipeline.inFlight, "the control: a verb is in flight").not.toBeNull();
      await w.type(KITTY_CTRL_SHIFT_C);
      expect(w.graph.router.lastStages, "no cancel").not.toContain("cancel");
      expect(w.graph.pipeline.inFlight, "and the verb is still running").not.toBeNull();
    }
    {
      // S8: twice at an empty prompt arms nothing. Spied before the build, as
      // T4.86's copy spy is: the root copies the frame's function at construction.
      const exit = vi.spyOn(FRAME, "raiseExitConfirm");
      const w = await world(true);
      await w.type(KITTY_CTRL_SHIFT_C);
      await w.type(KITTY_CTRL_SHIFT_C);
      expect(exit, "no exit confirm").not.toHaveBeenCalled();
      // The control: the same two presses of `⌃c` do raise it.
      await w.type(CTRL_C);
      await w.type(CTRL_C);
      expect(exit, "while ⌃c twice does").toHaveBeenCalledTimes(1);
    }
    {
      // S9: at a question a copy is not an interrupt. **Since ruling 59 neither
      // answers the question** — the router refuses `⌃c` there and the
      // classifier stopped reading it (C16 I62) — so what differs is the stage:
      // `⌃c` takes the intercept, and `⌃⇧C` reaches the question as the key it is.
      const w = await world(true);
      let answered: unknown = null;
      void w.graph.confirm.ask({ question: "delete?", choices: REPLYABLE }).then((a) => (answered = a));
      await new Promise((r) => setTimeout(r, 0));
      const interrupts = () => w.graph.router.lastStages.filter((s) => s.startsWith("intercept:interrupt"));
      // Twice: a newly raised owner refuses its first activation (C16 I44).
      await w.type(KITTY_CTRL_SHIFT_C);
      await w.type(KITTY_CTRL_SHIFT_C);
      expect(interrupts(), "no interrupt stage").toEqual([]);
      expect(w.graph.confirm.open, "the question is still open").toBe(true);
      expect(answered, "and unanswered").toBeNull();
      // The control: `⌃c` takes the intercept at the question's rung.
      await w.type(CTRL_C);
      expect(interrupts(), "⌃c is the interrupt").toEqual([expect.stringMatching(/^intercept:interrupt:question:/u)]);
    }
    {
      // S10: on the base profile the bytes are `0x03`, and interrupt wins.
      const w = await slowWorld(false);
      await w.type("/slow\r");
      expect(w.graph.pipeline.inFlight).not.toBeNull();
      await w.type(CTRL_C);
      expect(w.graph.router.lastStages, "0x03 cancels").toContain("cancel");
      expect(w.graph.pipeline.inFlight).toBeNull();
    }
  });

  it("T4.89 (C16 I66, §6c S11): a selection chord from the other copy mode switches and leaves one mode; from its own mode it changes nothing", async () => {
    // **A real session, because the switch is the session's** (§6c rulings):
    // `buildGraph`'s copy modes are two flags a test sets, and the defect this
    // row guards was two real guards each reading only its own flag.
    const stdin = fakeStdin();
    const { stdout, screen, clock } = await buildSession({ stdin: stdin as never });
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 3; i += 1) await Promise.resolve();
    };
    /**
     * **`esc` leaves native selection, not `⌃c`** — ruling 59 makes `⌃c` a
     * refusal in either copy mode (C16 I62). A lone `Esc` waits C16 §2's 50 ms
     * to be told apart from a sequence prefix; the wake is a real timer against
     * the injected clock.
     */
    const esc = async (): Promise<void> => {
      stdin.emit(ESC);
      clock.advance(80);
      await new Promise((r) => setTimeout(r, 80));
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };
    const header = () => screen().rows[0] ?? "";

    expect(header(), "the control: no mode before the key").not.toMatch(/COPY|NATIVE/u);

    // Semantic, then native from it: one mode, and it is native.
    await type(`${ESC}V`);
    expect(header(), "⌥⇧V enters semantic copy").toContain("COPY");
    await type(`${ESC}C`);
    expect(header(), "⌥⇧C from semantic copy switches to native").toContain("NATIVE");
    // **Leaving native shows what was underneath** — the observable that
    // separates a switch from a stack. `#copyState` answers native first, so
    // while both are on the header says NATIVE either way; the exit is where a
    // semantic mode left beside it would reappear.
    await type(`${ESC}V`);
    expect(header(), "⌥⇧V from native switches back to semantic").toContain("COPY");
    expect(header(), "and native is gone").not.toContain("NATIVE");
    await type(`${ESC}C`);
    await esc();
    expect(header(), "esc leaves native, and no semantic mode was left under it").not.toMatch(/COPY|NATIVE/u);

    // Same mode: nothing changes.
    await type(`${ESC}C`);
    expect(header()).toContain("NATIVE");
    const held = stdout.output;
    await type(`${ESC}C`);
    expect(stdout.output, "⌥⇧C in native selection writes nothing").toBe(held);
    await esc();
    await type(`${ESC}V`);
    const frame = screen().rows.join("\n");
    await type(`${ESC}V`);
    expect(screen().rows.join("\n"), "⌥⇧V in semantic copy changes nothing").toBe(frame);
  });
});
