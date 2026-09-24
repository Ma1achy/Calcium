// C19 I28 — a candidate that accepts into a chip (§011).
//
// **The seam, and both halves of it shipped without ever meeting.** C17 has
// minted chips since roadmap 30 and the only caller was a large paste; every
// candidate this engine produced accepted as a string. So a mention was
// expressible in neither direction — a source could offer a file, and accepting
// it inserted a path.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";
import type { CompletionSource } from "../../src/interaction/completion/index.js";

/**
 * §011's source: one file, its size in the menu, its parts on the chip.
 *
 * **Two strings and they are not one field.** `detail` is `184 lines · 6.2 KB`
 * — free text only the source can compose, because only it knows bytes — and
 * `chip.lines` is `184`, which C17 draws as `184L`. A design reading them as one
 * would make the engine format a file size.
 */
const mentions = (withChip: boolean): CompletionSource => ({
  id: "mentions",
  slots: ["path"],
  dynamic: false,
  complete: () => [
    {
      value: "parse.ts",
      detail: "184 lines · 6.2 KB",
      ...(withChip
        ? {
            chip: {
              kind: "file" as const,
              name: "parse.ts",
              lines: 184,
              content: "line one\nline two",
              target: "src/interaction/parser/parse.ts",
            },
          }
        : {}),
    },
  ],
});

describe("C19 I28 — a candidate may accept into a chip", () => {
  it("T1.71 (C19 I28, §011, C17 I25, C19 I11): a candidate carrying chip parts accepts into a chip, in one undo unit, with C17's label", async () => {
    // **Driven through stdin, not through `dispatch`** — the accept runs in the
    // request's continuation, and a row that pressed the key without a read
    // loop asserts against the frame before it (C22 I31, T1.13).
    const attach = async (withChip: boolean) => {
      const { graph, stdin } = await buildGraph();
      graph.lifecycle.acquire();
      graph.completion.register(mentions(withChip));
      // `echo` is nobody's verb in this manifest, so its arguments are paths
      // (C19 §8b) — which is the slot a mention sits in.
      stdin.emit("echo par");
      stdin.emit("\t");
      await new Promise((r) => setTimeout(r, 0));
      return graph;
    };

    const g = await attach(true);
    const editor = g.editor;

    // **One sentinel where the token was.** The buffer holds a single grapheme
    // for the chip — not the path, which is what every candidate before this
    // one inserted.
    expect(editor.text, `buffer: ${JSON.stringify(editor.text)}`).not.toContain("parse.ts");

    // **The whole buffer, drawn** — because every part of this claim is about a
    // position. `par` is gone, exactly one grapheme stands where it was, and
    // the delimiter is past it (C19 I16). Read as a shape rather than as four
    // separate counts: a chip inserted beside the token rather than over it
    // satisfies every count taken alone.
    const shape = (e: typeof editor): string =>
      [...e.text].map((c) => (e.drawAs(c) === undefined ? c : "\u25c6")).join("");
    expect(shape(editor), `buffer: ${JSON.stringify(editor.text)}`).toBe("echo \u25c6 ");

    // **The parts crossed the seam and the LABEL did not.** `[parse.ts · 184L]`
    // is C17's composer given a name; the source never spelled it, which is C17
    // I25 arriving at a second producer rather than being restated by it.
    // **Back one, because the accept left the delimiter** (C19 I16): the caret
    // sits past a space, and `chipAt` answers for the chip the caret is *on*
    // (C17 I27). Asserting from where the accept left it would be asserting
    // about the space.
    editor.move("charLeft");
    const chip = editor.chipAt();
    expect(chip, "a chip is under the caret").not.toBeNull();
    expect(chip?.kind).toBe("file");
    expect(chip?.name).toBe("parse.ts");
    expect(chip?.lines).toBe(184);
    // **The ordinal is C17's** (C17 I25): the source handed over no number, and
    // the chip has one. A source that spelled its own would be §011's form
    // authored a second time in every application.
    expect(chip?.ordinal, "numbered by the editor, not by the source").toBe(1);

    // **And the label is composed, not carried.** The sentinel resolves to a
    // form holding the name and `184L` — C17's spelling of `Chip.lines`, which
    // the source gave as the bare number 184.
    const sentinel = [...editor.text][5] ?? "";
    const drawn = editor.drawAs(sentinel) ?? "";
    expect(drawn, `drawn: ${JSON.stringify(drawn)}`).toContain("parse.ts");
    expect(drawn, "the line count is C17's `184L`, not the source's `184`").toContain("184L");

    // **One undo unit** (C19 I11). The build this is written against is a
    // delete followed by an insert: it draws identically and leaves the reader
    // one `⌃_` short, back at a buffer whose token is already gone.
    const after = editor.text;
    editor.undo();
    expect(editor.text, `one ⌃_ restores the typed token, not a buffer missing it`).toBe("echo par");
    expect(editor.text).not.toBe(after);

    // **The control**: the same candidate with no chip parts inserts its value,
    // exactly as every candidate always has — so the chip arm is the change and
    // not the accept path moving under it.
    const plain = await attach(false);
    expect(plain.editor.text, "no chip parts → the value is inserted").toContain("parse.ts");
    plain.editor.move("charLeft");
    expect(plain.editor.chipAt(), "and no chip is minted").toBeNull();
  });
});
