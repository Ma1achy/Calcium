// F165 — the far side's error code reaches a frame.
//
// **`errorDoc` rendered two of `ErrorLike`'s five members and nothing said so.**
// `code` and `details` are parsed off the far side's own envelope by
// `data/adapters/mapping.ts`, typed, frozen and dropped; `stage` is the
// framework's own and is dropped with them. The residue that found it is roadmap
// 48's, and the axis that sorted the three is *could anyone but the framework
// know this value* — which keeps all three and moves who writes them.
import { describe, expect, it } from "vitest";
import { errorDoc } from "../../src/shell/documents.js";

const meta = { origin: "user" } as const;

const noticeText = (doc: ReturnType<typeof errorDoc>, id: string): string => {
  const block = doc.blocks.find((b) => b.id.startsWith(id));
  if (block === undefined || block.kind !== "notice") throw new Error(`no ${id} notice`);
  return block.text;
};

describe("C23 §5 — errorDoc", () => {
  it("T1.40 (F165): the far side's code is shown beside its message", () => {
    const doc = errorDoc("docker rm x", { message: "no such container", code: "NO_SUCH" }, meta);

    expect(noticeText(doc, "error"), "the code qualifies the message").toBe(
      "NO_SUCH: no such container",
    );
  });

  it("T1.41 (F165): a failure with no code reads exactly as it did", () => {
    // The control, and the reason it matters: every existing document carries no
    // code, so a prefix applied unconditionally would put a bare colon in front
    // of every error in the app.
    const doc = errorDoc("docker rm x", { message: "no such container" }, meta);

    expect(noticeText(doc, "error")).toBe("no such container");
  });

  it("T1.42 (F165): the error object still carries every member it was given", () => {
    // Rendering is not the same as keeping. `details` has no renderer yet — it
    // is structure rather than a sentence, and what draws it is a C09 question —
    // so the row that stops it being quietly dropped is this one.
    const error = {
      message: "no such container",
      code: "NO_SUCH",
      stage: "transport",
      details: { id: "abc", exit: 137 },
    };
    const doc = errorDoc("docker rm x", error, meta);

    expect(doc.error, "the document carries what the far side said").toEqual(error);
  });
});
