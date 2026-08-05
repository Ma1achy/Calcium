/**
 * Every document this app can produce, validated — the class, not the instance.
 *
 * **Three instances of one defect shipped before this file existed**, and none
 * of them could be seen from a green suite or a frame:
 *
 * - `/drift` against a missing container,
 * - `/ps` against a failing `docker`,
 * - `/container stats` against a container that reports nothing.
 *
 * All three set `status: "error"` and omitted `error`, which C04 I3 requires.
 * `transcript.append` validates and throws (C13 I10); `appendAndCommit` catches,
 * discards the outcome and commits the frame anyway — C23 §5's one stage whose
 * failure loses the outcome, which is documented and deliberate. **The effect on
 * an app author is that a malformed document is indistinguishable from a verb
 * that did nothing**: the prompt clears, nothing is appended, and no diagnostic
 * reaches any surface.
 *
 * Found by reading the frame for `/drift no-such-container` and seeing an empty
 * transcript. The other two were found by grepping for the shape once the first
 * was understood — neither had ever run, because no frame-read has yet had
 * docker fail on those verbs. FINDINGS F35.
 *
 * **`validateDocument` is reached by a deep import**, which an application
 * cannot legitimately do: the package exports no validator (FINDINGS F36). That
 * is the reason this class went unnoticed — an app has no way to check the one
 * thing the layer below will silently refuse. Asserting the shape by hand
 * instead would encode C04 I3 here rather than check it, and would agree with a
 * document the framework rejects.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- F36: no public validator.
import { validateDocument } from "../../../dist/data/viewmodel/index.js";
import type { ViewDocument } from "@fmx/calcium";
import { createCompareHandler, createDriftHandler } from "../src/drift.ts";
import { createPsAdapter } from "../src/ps.ts";
import { createContainerAdapter } from "../src/container.ts";

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

/** A `Result` as C06 hands one to an adapter. */
const result = (over: Partial<Record<string, unknown>> = {}): never =>
  ({
    exitCode: 0,
    stdoutRaw: "",
    stderr: "",
    argv: ["docker", "ps"],
    durationMs: 1,
    ...over,
  }) as never;

const ctx = { command: "/x", verb: "x", transport: "subprocess", origin: "user", width: 120 } as never;

/**
 * Every document the app can produce, named by the path that produces it.
 *
 * **The failure arms come first**, because they are the ones nothing exercises:
 * a happy-path document is validated by every frame-read implicitly, and an
 * error document is validated by nothing until docker misbehaves in front of a
 * human.
 */
const DOCUMENTS: readonly (readonly [string, () => Promise<ViewDocument> | ViewDocument])[] = [
  ["/drift — no such container", () => createDriftHandler()(["no-such-xyz"], { command: "/drift no-such-xyz" })],
  ["/drift — no argument", () => createDriftHandler()([], { command: "/drift" })],
  ["/compare — missing side", () => createCompareHandler()(["no-a", "no-b"], { command: "/compare no-a no-b" })],
  ["/compare — no arguments", () => createCompareHandler()([], { command: "/compare" })],
  ["/ps — docker exited non-zero", () => createPsAdapter().adapt(result({ exitCode: 1, stderr: "boom" }), ctx)],
  ["/ps — docker exited non-zero, silent", () => createPsAdapter().adapt(result({ exitCode: 2 }), ctx)],
  ["/ps — ok", () => createPsAdapter().adapt(result({ stdoutRaw: read("ps-real.ndjson") }), ctx)],
  ["container stats — non-zero", () => createContainerAdapter().adapt(result({ exitCode: 1, stderr: "no such container" }), ctx)],
  ["container stats — zero rows", () => createContainerAdapter().adapt(result({ stdoutRaw: "" }), ctx)],
  ["container stats — ok", () => createContainerAdapter().adapt(result({ stdoutRaw: read("stats-real.ndjson") }), ctx)],
];

describe("F35: every document this app produces is one C13 will accept", () => {
  it.each(DOCUMENTS.map(([name]) => name))("%s", async (name) => {
    const make = DOCUMENTS.find(([n]) => n === name)?.[1];
    const doc = await (make as () => Promise<ViewDocument>)();
    const v = validateDocument(doc);
    // The message carries the errors, because "expected false to be true" on a
    // document is a fault you then have to reproduce by hand.
    expect(v.ok, `${name}: ${v.ok ? "" : v.error.join("; ")}`).toBe(true);
  });

  it("the failure arms are actually failures, or the rows above prove nothing", () => {
    // **A fixture must be shown to respond to the thing under test.** Every row
    // above would pass against an app whose error paths silently returned `ok`
    // documents — which is a different defect with the same green suite.
    const failing = DOCUMENTS.filter(([n]) => !n.endsWith("ok"));
    expect(failing.length).toBeGreaterThan(6);
  });

  it("and an error document without its `error` is refused, which is the defect", async () => {
    // The control for the whole file: this is what all three shipped arms
    // looked like, and it is what C13 throws on and C23 discards.
    const doc = await createDriftHandler()(["no-such-xyz"], { command: "/drift x" });
    const stripped = { ...(doc as Record<string, unknown>) };
    delete stripped["error"];

    expect(validateDocument(stripped).ok, "C04 I3 is what makes this file necessary").toBe(false);
  });
});
