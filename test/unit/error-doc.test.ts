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

/**
 * The failure's own text — **from a `status` now, and a `notice` for the
 * remediation** (F406).
 *
 * The error block was a `notice` at twelve call sites while the framework carried
 * a whole kind for a failure and drew it only when a renderer threw. The two
 * readers are kept apart deliberately: the box says what failed and the notice
 * says what to do, so a row asking for one and getting the other fails rather
 * than reading the wrong block's text.
 */
const errorText = (doc: ReturnType<typeof errorDoc>): string => {
  const block = doc.blocks.find((b) => b.id.startsWith("error"));
  if (block === undefined || block.kind !== "status") throw new Error("no error status");
  return block.message;
};

const noticeText = (doc: ReturnType<typeof errorDoc>, id: string): string => {
  const block = doc.blocks.find((b) => b.id.startsWith(id));
  if (block === undefined || block.kind !== "notice") throw new Error(`no ${id} notice`);
  return block.text;
};

describe("C23 §5 — errorDoc", () => {
  it("T1.40 (F165): the far side's code is shown beside its message", () => {
    const doc = errorDoc("docker rm x", { message: "no such container", code: "NO_SUCH" }, meta);

    expect(errorText(doc), "the code qualifies the message").toBe("NO_SUCH: no such container");
    // **And it is the failure box, not a red line** (F406, C09 §3a). `error`
    // because nothing is coming — the same distinction C23 I51 draws on the live
    // path — and six rows, which is the frame read: a realistic message truncates
    // at four and wraps to two rows with one blank at six.
    const box = doc.blocks.find((b) => b.id.startsWith("error"));
    expect(box).toMatchObject({ kind: "status", state: "error", height: 6 });
    expect("framed" in (box ?? {}), "free-standing — no container draws a border here").toBe(false);
  });

  it("T1.41 (F165): a failure with no code reads exactly as it did", () => {
    // The control, and the reason it matters: every existing document carries no
    // code, so a prefix applied unconditionally would put a bare colon in front
    // of every error in the app.
    const doc = errorDoc("docker rm x", { message: "no such container" }, meta);

    expect(errorText(doc)).toBe("no such container");
  });

  it("T1.43 (F406): the remediation is a notice beneath the box, not folded into it", () => {
    // **Two blocks and two readers**, and the split is the ruling rather than an
    // accident of what was there before. A `status` carries one `message`, which
    // at a typical width already wraps to two rows — folding the remediation in
    // would put the one actionable line in competition with the description of
    // the failure. The box says what failed; this says what to do.
    //
    // **The helper for this had no caller until now**, which is why it is here:
    // `errorDoc` has emitted the remediation since F165 and nothing asserted it,
    // so the block was a surface with no row. Found by the error block becoming a
    // different kind — the unused helper was the thing that said so.
    const doc = errorDoc(
      "docker rm x",
      { message: "no such container", remediation: "docker ps -a lists the stopped ones" },
      meta,
    );

    expect(doc.blocks.map((b) => b.kind), "the box, then the notice").toEqual(["status", "notice"]);
    expect(noticeText(doc, "remediation")).toBe("docker ps -a lists the stopped ones");

    // And a failure with nothing to suggest is the box alone — a second block
    // saying nothing would read as a second failure.
    const bare = errorDoc("docker rm x", { message: "no such container" }, meta);
    expect(bare.blocks.map((b) => b.kind), "no remediation, no notice").toEqual(["status"]);
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
