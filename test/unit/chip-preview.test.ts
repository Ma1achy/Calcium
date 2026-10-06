// C22 §6l.12 — where a chip previews (§101, `R-BLK-823`, `R-BLK-824`).
//
// **A projection, not a mode.** §101 puts a chip's preview in two places and
// names focus as what chooses; the registry names no binding that opens one, so
// the panel is recomputed from the caret exactly as the transcript's peek is
// recomputed from focus. These rows drive the real input path — a bracketed
// paste through stdin — because the projection lives between the router and the
// frame, and a test calling the mechanism directly would miss the wiring.
import { describe, expect, it } from "vitest";

import { NO_EDITOR, openChipInEditor } from "../../src/shell/chip-editor.js";
import { buildGraph, buildSession, fakeFs, FRAME } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { ASCII_CAPS } from "../support/render.js";

/** Written as a code point rather than a literal, so no control byte is in the file. */
const ESC = String.fromCharCode(27);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setImmediate(r));
};

/** Above `CHIP_LINES`, so the paste becomes a chip rather than text. */
const pasteOf = (n: number, word: string): string =>
  Array.from({ length: n }, (_, i) => `${word} ${String(i)}`).join("\n");

type Session = Readonly<{
  rows: () => Promise<readonly string[]>;
  send: (bytes: string) => void;
  paste: (text: string) => void;
}>;

const session = async (): Promise<Session> => {
  const stdin = fakeStdin();
  const { screen } = await buildSession({ stdin: stdin as never } as never);
  await settle();
  const send = (bytes: string): void => {
    stdin.emit(bytes);
  };
  return {
    send,
    paste: (text) => send(`${ESC}[200~${text}${ESC}[201~`),
    rows: async () => {
      await settle();
      return screen().rows;
    },
  };
};

/**
 * Whether any row holds the text, once the screen has folded the SGR away.
 *
 * **Asked about the chip's *content*, never about its label**, and the first
 * draft asked about the label. The prompt draws the label inline — that is what
 * §6l.11 paints — so `#1 pasted` is on the screen whether a panel exists or
 * not, and every negative arm read as a preview that would not go away. The
 * content is in the panel and nowhere else, which makes it the one string that
 * distinguishes the two.
 */
const shows = (rows: readonly string[], text: string): boolean =>
  rows.some((r) => r.includes(text));

/**
 * How many rows hold the text.
 *
 * **The label needs a count and not a presence**, which is the same conflation
 * read from the third side: the prompt draws the chip's label inline, so *the
 * panel is titled with it* is satisfied by the prompt's row alone — a mutation
 * putting a literal in the title survived exactly that. Two rows carry it when
 * the panel is titled properly, and one when it is not.
 */
const count = (rows: readonly string[], text: string): number =>
  rows.filter((r) => r.includes(text)).length;

describe("C22 §6l.12 — a chip previews above the prompt", () => {
  it("T1.69 (C22 I113, §6l.12, §101): the panel follows the caret, and there is none without a chip", async () => {
    const s = await session();

    // **The control first.** A paste below the chip threshold is text, so the
    // caret is on no chip and nothing is pushed — without this row, *a panel is
    // present* is satisfied by a projection that pushes one for every buffer.
    //
    // **Asked about the label here and about the content everywhere else**,
    // which is the same conflation read from the other side: a text paste puts
    // its own words in the prompt, so `short 0` is on the screen either way,
    // and what cannot be there without a chip is a chip's label.
    s.paste(pasteOf(2, "short"));
    const plain = await s.rows();
    expect(shows(plain, "#1 pasted"), "two lines are text, not a chip").toBe(false);

    // A chip, and the caret is left past it by `insertChip` — so this is the
    // backwards arm, which is the one a reader arrives at by pasting.
    s.paste(pasteOf(6, "alpha"));
    const one = await s.rows();
    expect(shows(one, "alpha 0"), "the chip's content is the panel's body").toBe(true);
    expect(count(one, "#1 pasted"), "the prompt's chip and the panel's title").toBe(2);

    // **Typing moves the caret off it and the panel goes**, which is what makes
    // this a projection rather than a layer that was opened. Asserted as the
    // label's absence, since the body could be scrolled out of a panel that is
    // still there.
    s.send("xy");
    expect(shows(await s.rows(), "alpha 0"), "the caret has left the chip").toBe(false);

    // **A second chip, and the caret moves between them** — §101's `←→ other
    // chips` with no binding behind it. Walking left off the second chip's own
    // cell and the two characters typed puts the caret past the first again.
    s.paste(pasteOf(9, "beta"));
    expect(shows(await s.rows(), "beta 0"), "the second chip previews").toBe(true);
    s.send(`${ESC}[D${ESC}[D${ESC}[D`);
    const back = await s.rows();
    expect(shows(back, "alpha 0"), "the caret walked back to the first").toBe(true);
    expect(shows(back, "beta 0"), "and only one chip previews at a time").toBe(false);
  });

  it("T1.70 (C22 I113, §6l.12, C15 §2c): nothing is pushed while another layer holds the region", async () => {
    // **A reverse search, because it opens on one byte and holds the region.**
    // The first draft typed `/` to open a completion menu and opened nothing —
    // the harness's manifest carries no tools, so there were no candidates —
    // and the arm passed because typing the character had moved the caret off
    // the chip. A layer that does not exist and a guard that works read the
    // same from the frame, which is the vacuity the control below answers.
    const CTRL_R = String.fromCharCode(18);

    // The dismissal arm: a preview is up, and something the reader is in the
    // middle of takes the region.
    const a = await session();
    a.paste(pasteOf(6, "gamma"));
    expect(shows(await a.rows(), "gamma 0"), "the preview is up").toBe(true);
    a.send(CTRL_R);
    const searching = await a.rows();
    expect(shows(searching, "reverse search"), "the search took the region").toBe(true);
    expect(shows(searching, "gamma 0"), "and the preview gave way whole").toBe(false);

    // **The push arm, and it is the half a dismissal cannot cover.** C15's
    // manager dismisses a panel when another opens, so the arm above is
    // satisfied by a projection with no guard at all — it would be dismissed
    // by the search and push itself straight back on the next key. Here the
    // layer is up *first* and the chip arrives under it.
    const b = await session();
    b.send(CTRL_R);
    b.paste(pasteOf(6, "delta"));
    const under = await b.rows();
    expect(shows(under, "reverse search"), "the search still holds it").toBe(true);
    expect(shows(under, "delta 0"), "nothing is pushed beneath it").toBe(false);
  });
});

describe("C22 §6q — the chip preview's box and keys (ruling 53), owed at the spec commit", () => {
  it("T1.175 (C22 I143, ruling 53): the preview is the edge, the header, a bounded box and the key row, and the layer is never cut", async () => {
    // The harness frame's layer region is 24 rows, so a box that fits is
    // capped at `floor(24 / 2) − 3 = 9` and one that overflows at 8 — C15's
    // default fraction less the edge, the header and the key row, and less the
    // box's own residue row when it overflows (C04 I49, §6s.3 rows 1–2).
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();
    const preview = () => graph.overlays.stack.find((l) => l.id === "chip-preview");
    const parts = () => {
      const content = preview()?.content;
      if (content === undefined) return null;
      const [edge, header, box, keys] = content;
      return {
        kinds: content.map((b) => b.kind),
        edge: edge?.kind === "rule" ? edge.label : null,
        header: header?.kind === "raw" ? header.text : null,
        height: box?.kind === "scroll" ? box.height : null,
        keys: keys?.kind === "raw" ? keys.text : null,
      };
    };
    /** Whether C15 cut the layer — the half the cap exists for. */
    const cut = () =>
      graph.overlays.layout(FRAME.overlayRegion()).find((p) => p.layer.id === "chip-preview")?.truncated;
    const KINDS = ["rule", "raw", "scroll", "raw"];

    stdin.emit(`${ESC}[200~${pasteOf(47, "long")}${ESC}[201~`);
    await settle();
    expect(parts(), "a 47-line chip overflows the bounded box").toEqual({
      kinds: KINDS,
      edge: "",
      header: "#1 pasted · 47L",
      height: 8,
      keys: "⌥⇧↑↓ scroll  ⌥o open in editor",
    });
    expect(cut(), "and its residue row fits: the layer is whole").toBe(false);
    expect(graph.ownerHints().previewScrolls, "the owner line names the scroll too").toBe(true);

    // **The boundary, from both sides.** Nine rows fit the cap exactly and
    // draw no residue; ten overflow, and the box gives the residue its row.
    for (const [lines, height, keys] of [
      [9, 9, "⌥o open in editor"],
      [10, 8, "⌥⇧↑↓ scroll  ⌥o open in editor"],
    ] as const) {
      graph.editor.clear();
      stdin.emit(`${ESC}[200~${pasteOf(lines, "edge")}${ESC}[201~`);
      await settle();
      expect(parts()?.height, `${String(lines)} lines`).toBe(height);
      expect(parts()?.keys, `${String(lines)} lines`).toBe(keys);
      expect(cut(), `${String(lines)} lines: the layer is whole`).toBe(false);
    }

    // **The control: a chip that fits is exactly its rows**, and a chord that
    // would move nothing is not offered.
    graph.editor.clear();
    stdin.emit(`${ESC}[200~${pasteOf(6, "short")}${ESC}[201~`);
    await settle();
    expect(parts()?.height, "a 6-line chip fits").toBe(6);
    expect(parts()?.keys).toBe("⌥o open in editor");
    expect(graph.ownerHints().previewScrolls, "and names no scroll").toBeUndefined();
  });

  it("T1.176 (C22 I144, C02 I19): the editor's arms — refused with none, re-minted on a change, the directory gone on every path", async () => {
    const chip = { ordinal: 1, kind: "paste" as const, name: "pasted", lines: 3, content: "a\nb\nc" };
    const calls: (readonly string[])[] = [];
    const fs = fakeFs();
    /** A fake terminal loan that runs `edit` over the file the argv names as `$1`. */
    const borrowing =
      (edit: (text: string) => string | null) =>
      async (argv: readonly string[]) => {
        calls.push(argv);
        const path = argv[4] ?? "";
        const text = await fs.readFile(path);
        const next = edit(text);
        if (next !== null) await fs.writeFile(path, next);
        return { kind: "ran" as const, exit: { code: 0, signal: null } };
      };
    const deps = (editor: string | null, edit: (text: string) => string | null) => ({
      editor,
      fs,
      borrow: borrowing(edit),
      chord: "⌥o",
    });

    // No editor: refused, and nothing ran.
    expect(await openChipInEditor(chip, deps(null, (t) => t))).toEqual({ kind: "refused", text: NO_EDITOR });
    expect(calls, "nothing was lent the terminal").toEqual([]);

    // A change: the content back, its lines recounted — and the path is `$1`,
    // never text in the command.
    const changed = await openChipInEditor(chip, deps("vi -n", (t) => t.replace("b\n", "")));
    expect(changed).toEqual({ kind: "changed", content: "a\nc", lines: 2 });
    expect(calls[0]?.slice(0, 4)).toEqual(["sh", "-c", 'vi -n "$1"', "sh"]);
    const path = calls[0]?.[4] ?? "";
    await expect(fs.readFile(path), "the directory went with its file").rejects.toThrow(/ENOENT/u);

    // **An editor's final newline is the file's**: written back with one added
    // and nothing else, the chip is unchanged.
    expect(await openChipInEditor(chip, deps("vi", (t) => `${t}\n`))).toEqual({ kind: "unchanged" });
    expect(await openChipInEditor(chip, deps("vi", () => null))).toEqual({ kind: "unchanged" });

    // Busy: refused naming the verb, and the directory is still removed.
    const busy = await openChipInEditor(chip, {
      editor: "vi",
      fs,
      borrow: async () => ({ kind: "busy" as const, verb: "deploy" }),
      chord: "⌥o",
    });
    expect(busy).toEqual({ kind: "refused", text: "deploy is still running, and ⌥o waits for it" });

    // A throw from the loan: the directory is removed before it propagates.
    let thrownPath = "";
    await expect(
      openChipInEditor(chip, {
        editor: "vi",
        fs,
        borrow: async (argv) => {
          thrownPath = argv[4] ?? "";
          throw new Error("handoff refused");
        },
        chord: "⌥o",
      }),
    ).rejects.toThrow("handoff refused");
    await expect(fs.readFile(thrownPath), "removed on the throwing path too").rejects.toThrow(/ENOENT/u);

    // A target opens the target, as `$1`, and nothing comes back.
    calls.length = 0;
    const opened = await openChipInEditor(
      { ...chip, target: "/work/notes.md" },
      {
        editor: "code -w",
        fs,
        borrow: async (argv) => {
          calls.push(argv);
          return { kind: "ran" as const, exit: { code: 0, signal: null } };
        },
        chord: "⌥o",
      },
    );
    expect(opened).toEqual({ kind: "opened" });
    expect(calls).toEqual([["sh", "-c", 'code -w "$1"', "sh", "/work/notes.md"]]);
  });
});

describe("C22 §6s — the preview's key row names the other chips (I143)", () => {
  it("T1.185 (C22 I143, §6s.3 row 4): `←→ other chips` is offered while the prompt holds another chip", async () => {
    // **The prompt's own pair**, `left` and `acceptGhostOrForward`: the
    // preview binds nothing that moves the caret, and the legend names what
    // the caret's motion already does (§101). Offered on the scroll pair's
    // rule — not while there is nothing for it to reach.
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();
    const keys = (): string | null => {
      const row = graph.overlays.stack.find((l) => l.id === "chip-preview")?.content.at(-1);
      return row?.kind === "raw" ? row.text : null;
    };

    stdin.emit(`${ESC}[200~${pasteOf(6, "one")}${ESC}[201~`);
    await settle();
    expect(keys(), "one chip: nowhere for ←→ to go").toBe("⌥o open in editor");

    stdin.emit(`${ESC}[200~${pasteOf(6, "two")}${ESC}[201~`);
    await settle();
    expect(keys(), "two chips, the caret on the second").toBe("⌥o open in editor  ←→ other chips");

    // **And back, with the caret still on a chip.** Deleting the second from
    // behind the caret leaves the first previewed with no other to reach, so
    // the row is rebuilt although the chip did not change.
    stdin.emit(`${ESC}[D`);
    await settle();
    stdin.emit(`${ESC}[3~`);
    await settle();
    expect(keys(), "the other chip deleted").toBe("⌥o open in editor");
  });

  it("T1.185 (C22 I143, §6s.3 row 9): where the row does not fit it sheds whole entries from its end", async () => {
    // **Read from the frame, where it was found**: at ASCII the three entries
    // are 64 cells, and a 60-column frame's region is 59 — the `raw` row cut
    // the legend to `oth~`. Two six-line chips over a 20-row frame overflow the
    // box, so the scroll pair is drawn and the row is at its widest.
    const stdin = fakeStdin();
    const { screen, resize } = await buildSession({ stdin: stdin as never, capabilities: ASCII_CAPS } as never, { columns: 60, rows: 20 });
    await settle();
    stdin.emit(`${ESC}[200~${pasteOf(7, "one")}${ESC}[201~`);
    stdin.emit(`${ESC}[200~${pasteOf(6, "two")}${ESC}[201~`);
    const rows = await (async () => {
      await settle();
      return screen().rows;
    })();
    const row = rows.find((r) => r.includes("open in editor"));
    expect(row?.trimEnd(), "scroll and open kept, the legend shed whole").toBe("M-S-Up/M-S-Down scroll  M-o open in editor");
    expect(rows.some((r) => r.includes("oth~")), "and never a legend cut mid-word").toBe(false);

    // **A width-only resize rebuilds it** (§6s.3 row 9): the height is the
    // same, and at 80 columns the whole row fits again. Keyed on the height
    // alone, the 59-cell row would stand in a 79-cell region.
    //
    // **Polled, because a resize's frame is paced** (C03): the scheduler draws
    // it on its own clock rather than in the batch, and the first read of this
    // arm found the 60-column frame still on the screen and read it as a
    // preview that had not rebuilt. The poll is bounded; the assertion is on
    // what it settles to.
    resize({ columns: 80, rows: 20 });
    const WANT = "M-S-Up/M-S-Down scroll  M-o open in editor  Left/Right other chips";
    const keyRow = (): string | undefined => screen().rows.find((r) => r.includes("open in editor"))?.trimEnd();
    for (let i = 0; i < 80 && (screen().rows[0]?.trimEnd().length ?? 0) <= 60; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
    }
    await settle();
    expect(keyRow(), "the legend is back").toBe(WANT);
  });
});
