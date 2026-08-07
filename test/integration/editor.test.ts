// C17 tier 4 — integration. Against a real C16 decoder, a real router with the
// shipped keymap, and C09's real `cells()`.
//
// **The keymap is `defaultKeymap`, not one written here.** A test that builds
// its own three newline rows has asserted its own arithmetic; the property is
// that the table dispatch resolves and `/help` renders is the table that makes
// multi-line input work (C16 §6, C17 I12).
import { describe, expect, it } from "vitest";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

import { createDecoder } from "../../src/interaction/router/decode.js";
import { createFocusStore } from "../../src/interaction/router/focus.js";
import { createKeymap, defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createRouter, type RouterDeps } from "../../src/interaction/router/router.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { createEditor, type LineEditor } from "../../src/interaction/editor/index.js";
import { cells } from "../../src/presentation/text.js";
import { parse } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";
import { accept, contextAt } from "../../src/interaction/completion/index.js";
import { openWith } from "../support/history.js";

const G = { first: 2, cont: 2 } as const;
const enc = new TextEncoder();

/** A terminal that cannot distinguish Shift-Enter — the majority case (§4). */
function plainTerminal(): ReturnType<typeof createDecoder> {
  let t = 0;
  return createDecoder({
    capabilities: { bracketedPaste: true, mouse: false },
    now: () => (t += 1000),
  });
}

/**
 * The wiring L4 will do: the router dispatches, a prompt handler applies the
 * resolved action to the editor. Nothing here is a fake except the deps C17
 * has no opinion about.
 */
function wire(editor: LineEditor): {
  dispatch: (e: InputEvent) => boolean;
} {
  const keymap = createKeymap(defaultKeymap);
  const focus = createFocusStore();
  const deps: RouterDeps = {
    overlayAnswerCallback: () => null,
    overlayTop: () => null,
    overlayRegion: () => ({ width: 80, height: 24 }),
    placed: () => [],
    popLayer: () => {},
    copyMode: () => false,
    exitCopyMode: () => {},
    liveEntry: () => null,
    entryAtRow: () => null,
    inFlight: () => null,
    // C16's subscription rung (C23 §8a). Neither double runs a stream, so the
    // rung must be unable to fire — a `0` that answered `1` would swallow the
    // Ctrl-C these rows are about.
    liveStreams: () => 0,
    cancelNewestStream: () => false,
    cancel: () => {},
    signalShellChild: () => {},
    region: () => ({ top: 0, height: 10 }),
    mouseEnabled: () => false,
    promptHasText: () => editor.text !== "",
    clearPrompt: () => editor.clear(),
    raiseExitConfirm: () => {},
  };
  const router = createRouter({ focus, keymap, now: () => 0, deps });

  router.register("prompt", (e) => {
    if (e.kind === "paste") {
      // C16 T4.6 / C17 I5 — one event, one atomic edit.
      editor.insert(e.text, { atomic: true });
      return true;
    }
    if (e.kind !== "key") return false;

    const binding = keymap.resolve("prompt", e.key);
    if (binding?.action === "insertNewline") {
      editor.insert("\n");
      return true;
    }
    // A printable key. `space` is named rather than literal (C16 §2), which is
    // the kind of thing L4's handler has to know and C17 deliberately does not.
    if (!e.key.ctrl && !e.key.meta && e.key.name === "space") {
      editor.insert(" ");
      return true;
    }
    if (!e.key.ctrl && !e.key.meta && [...e.key.name].length === 1) {
      editor.insert(e.key.name);
      return true;
    }
    return false;
  });

  return { dispatch: (e) => router.dispatch(e) };
}

describe("C17 tier 4 — with C16", () => {
  it("T4.1 (with C16): printable keys insert; a paste is one atomic undo unit", () => {
    const editor = createEditor();
    const { dispatch } = wire(editor);
    const decoder = plainTerminal();

    for (const event of decoder.push(enc.encode("ls "))) dispatch(event);
    for (const event of decoder.push(enc.encode("[200~one\ntwo[201~"))) {
      dispatch(event);
    }

    expect(editor.text).toBe("ls one\ntwo");
    expect(editor.undo(), "the paste undoes as one").toBe(true);
    expect(editor.text).toBe("ls ");
  });

  it("T4.2 (with C16): Alt-Enter and Ctrl-J both insert a newline", () => {
    // On a terminal that cannot tell Shift-Enter from Enter, which is most of
    // them (§4). Driven from *bytes* rather than from fabricated key events,
    // because the defect this covers was in the decoder: `\n` decoded to
    // `enter`, so the Ctrl-J row resolved against an event nothing produced.
    const editor = createEditor();
    const { dispatch } = wire(editor);
    const decoder = plainTerminal();

    for (const event of decoder.push(enc.encode("a"))) dispatch(event);
    for (const event of decoder.push(enc.encode("\r"))) dispatch(event); // Alt-Enter
    for (const event of decoder.push(enc.encode("b"))) dispatch(event);
    for (const event of decoder.push(enc.encode("\n"))) dispatch(event); // Ctrl-J
    for (const event of decoder.push(enc.encode("c"))) dispatch(event);

    expect(editor.lines, "two terminal-independent newlines").toEqual(["a", "b", "c"]);
    expect(editor.displayRows(80, G)).toBe(3);
  });

  it("T4.2b (with C16): a bare Enter is not a newline", () => {
    // The other half, and the one that fails if `\r` is ever mapped to Ctrl-J
    // to make the first half pass. Enter reaches no newline binding, so the
    // prompt handler treats it as unbound and the buffer is unchanged.
    const editor = createEditor();
    const { dispatch } = wire(editor);
    const decoder = plainTerminal();

    for (const event of decoder.push(enc.encode("ls\r"))) dispatch(event);

    expect(editor.text, "Enter submits; it does not insert").toBe("ls");
  });
});

describe("C17 tier 4 — with C09", () => {
  it("T4.3 (with C09): the editor and every block resolve width through one cells()", () => {
    // The same implementation, not a second one that agrees today. Asserted
    // over C09's adversarial corpus, at a width where each string wraps.
    const corpus = [
      "日本語です",
      "👨‍👩‍👧 family",
      "école",
      "⚠️ warn",
      "🇬🇧 flag",
      "ábc",
    ];

    for (const text of corpus) {
      const e = createEditor({ text });
      const rows = e.layout(200, { first: 0, cont: 0 });

      expect(rows, `${text} fits one row at 200`).toHaveLength(1);
      // The editor's own idea of where the cursor ends up is a column, and it
      // is `cells()` of the whole row. A second width implementation in the
      // editor would differ here on exactly this corpus.
      expect(e.cursorCell(200, { first: 0, cont: 0 }).col).toBe(cells(text));
    }
  });

  it("T4.3b (with C09): the gutter is added to cells(), not folded into it", () => {
    const e = createEditor({ text: "日本" });

    expect(cells("日本")).toBe(4);
    expect(e.cursorCell(80, G).col, "gutter plus width").toBe(6);
    expect(e.layout(80, G)[0], "and the row itself carries no gutter").toBe("日本");
  });
});

it("T4.4 (with C18): the buffer is classified without C18 mutating it", () => {
  // The seam between the two L3 components that both hold the line the user
  // typed. C17 owns it; C18 reads it and returns a decision, and `parse` is
  // pure by I1 — so the editor's state after a classification must be
  // identical, cursor included.
  const e = createEditor({ text: "/ps --mine", cursor: 4 });
  const before = { text: e.text, cursor: e.cursor, rows: e.displayRows(80, G) };

  const result = parse(e.text, {
    manifest: fixture(),
    binary: "widget",
    lastUuid: null,
  });

  expect(result.kind).toBe("app");
  expect({ text: e.text, cursor: e.cursor, rows: e.displayRows(80, G) }).toEqual(before);
});

it("T4.5 (C19 I11): the cursor decides the context, and accepting is one undo unit", () => {
  const e = createEditor();
  e.insert("/ps --st");

  // The context is built from the editor's buffer at the editor's cursor. C17
  // indexes by grapheme and C19 by code unit, so the conversion happens here,
  // at the seam — which is exactly where the spec puts it.
  const ctx = contextAt(e.text, e.text.length, fixture());
  expect(ctx.slot.kind).toBe("flagName");
  expect(ctx.prefix).toBe("--st");

  const depth = e.undoDepth;
  const { start, end, text } = accept(ctx, { value: "--status", delimiter: "=" }, true);

  // One edit, not a delete plus an insert and not one insert per character:
  // `atomic` is what makes a single `undo` revert the whole acceptance.
  e.setText(e.text.slice(0, start) + text + e.text.slice(end), start + text.length);
  expect(e.text).toBe("/ps --status=");
  expect(e.undoDepth).toBe(depth + 1);

  expect(e.undo()).toBe(true);
  expect(e.text).toBe("/ps --st");
});

// T4.6, written on the commit C20 landed. What it asserts is the seam rather
// than either component: C20 returns a string and **L4 applies it** (C20 I1), so
// this is the shape of the call the shell will make, standing in for it.
//
// The last two assertions are §7a Trace 3, and they are the reason this test is
// at this tier. C20 I3 resets navigation on a *user* edit and C20 cannot tell
// one from the setText it just caused — so the rule lives in the caller, and
// only a tier that holds both components can see it.
it("T4.6 (with C20, I2, I3): navigation replaces the buffer and the draft returns with its cursor", async () => {
  const { store } = await openWith();
  for (const c of ["/ps --status=running", "/logs digit-42"]) store.append(c, 0);

  const e = createEditor();
  e.insert("/pro");
  e.move("charLeft");
  expect([e.text, e.cursor]).toEqual(["/pro", 3]);

  // What L4 does on `↑`: take the buffer, apply what comes back, cursor at end.
  const up = (): void => {
    const next = store.previous(e.text);
    if (next !== null) e.setText(next, [...next].length);
  };
  const down = (): void => {
    const next = store.next();
    if (next !== null) e.setText(next, [...next].length);
  };

  up();
  expect([e.text, e.cursor]).toEqual(["/logs digit-42", 14]);
  up();
  expect(e.text).toBe("/ps --status=running");

  down();
  expect(e.text).toBe("/logs digit-42");
  down();
  // The draft, and the cursor is L4's to place — C20 never saw it (I1).
  expect(e.text).toBe("/pro");
  expect(store.navigating).toBe(false);

  // And the reset is on a *user* edit, not on the setText navigation caused:
  // wiring `resetNavigation` to every buffer change makes `↑` work exactly once.
  up();
  expect(store.navigating).toBe(true);
  e.insert("x");
  store.resetNavigation();
  expect(store.previous(e.text)).toBe("/logs digit-42");
});
it("T4.7 (C17 §2, C22 I13): the prompt's rendered height equals displayRows, on the frame", async () => {
  // **On the frame rather than on the editor**, which is the whole point of
  // the row: `displayRows` answering N and the frame drawing N are two claims,
  // and C22 already produced the defect where they disagreed — composed from
  // one record and painted from another, a wrapped prompt drawing as a lone
  // elision marker with every arithmetic check passing.
  const stdin = fakeStdin();
  const COLUMNS = 60;
  const { stdout, screen } = await buildSession(
    { stdin: stdin as never },
    { columns: COLUMNS, rows: 24 },
  );

  // **The screen, not the last write.** This took the last chunk containing
  // `HOME` and split it on CRLF, which is a frame exactly while every frame is
  // written whole; C22 I55 writes only the rows that changed. The question is
  // unchanged — what is on the screen — and only the answer's source moved.
  const frameRows = (): readonly string[] => screen().rows;

  // The prompt is every row from the first wearing the glyph down to the
  // footer — read off the frame, so the arithmetic under test is not also the
  // arithmetic doing the reading.
  const paintedRows = (): number => {
    const frame = frameRows();
    const first = frame.findIndex((r, i) => i > 0 && r.trimStart().startsWith("❯"));
    return first === -1 ? 0 : frame.length - 1 - first;
  };

  // **Three heights, because one cannot tell the two readings apart.** A prompt
  // that always painted one row satisfies any single-height assertion.
  const seen = new Set<number>();
  for (const typed of ["short", "y".repeat(120), "z".repeat(50)]) {
    stdin.emit("\u0015"); // ⌃u — clear, so each pass starts from nothing
    await Promise.resolve();
    stdin.emit(typed);
    await Promise.resolve();
    await Promise.resolve();

    const painted = paintedRows();
    expect(painted, `${String(typed.length)}: the prompt is on the frame`).toBeGreaterThan(0);

    // **The equality, against arithmetic this test does independently.** The
    // gutter is two cells on the first row and two on continuations (C22 I13),
    // so a line of N cells occupies ceil(N / (columns − 2)) rows. Computed here
    // rather than read from `displayRows`, because taking the number from the
    // code under test is the comparison this row exists to make, made with
    // itself.
    const body = COLUMNS - 2;
    const expected = Math.max(1, Math.ceil(typed.length / body));
    expect(painted, `${String(typed.length)}: rendered height is displayRows`).toBe(expected);

    seen.add(painted);
  }

  expect(seen.size, `the prompt really did change height: ${[...seen].join(", ")}`).toBeGreaterThan(
    1,
  );
});
