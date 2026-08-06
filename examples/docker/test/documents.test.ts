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
// F36: no public validator. Resolved through the package — see `deep.ts`,
// which is also the reason `make proof` was red for two PRs.
import { validateDocument } from "./deep.ts";
import type { ViewDocument } from "@fmx/calcium";
import { createCompareHandler, createDriftHandler } from "../src/drift.ts";
import { createPsAdapter } from "../src/ps.ts";
import { createContainerAdapter } from "../src/container.ts";
import { createInspectAdapter } from "../src/inspect.ts";
import { createConfigHandler, type Far } from "../src/config.ts";
import {
  createDiffAdapter,
  createImagesAdapter,
  createPortAdapter,
  createTopAdapter,
} from "../src/verbs.ts";
import { createEventsHandler } from "../src/events.ts";


import { createAdapterRegistry } from "@fmx/calcium";
import type { Adapter, AdapterContext, RawResult } from "@fmx/calcium";
/**
 * An adapter's answer, completed by the registry — which is what a document is.
 *
 * **`Adapter.adapt` no longer returns a `ViewDocument`** (F58b): it carries the
 * three `meta` keys an adapter owns and the registry fills the seven it does
 * not. Validating an adapter's return directly asserts against a half-built
 * artefact, and every row here is about what this app *produces*, which is the
 * registry's output.
 */
function viaRegistry(adapter: Adapter, raw: RawResult, ctx: AdapterContext): ViewDocument {
  return createAdapterRegistry({ v: adapter }).adapt(raw, ctx);
}

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

// **`tool: null` is required, and `as never` is what let it be missing.**
// `AdapterContext.tool` is `ToolDef | null` — required, nullable — and this
// literal omitted it, so `ctx.tool` was `undefined`. `usageBlocks` guards
// `tool === null` and `undefined !== null`, so the exit-2 route walked past the
// guard into `tool.args` and threw. Nothing caught it while these rows called
// adapters directly; routing them through the registry (F58b) reached the
// registry's exit-2 branch for the first time. The cast is the mechanism: a
// fixture narrower than the interface it stands for cannot fail on the
// difference, and `as never` removes the compiler that would have said so.
const ctx = {
  command: "/x",
  verb: "x",
  transport: "subprocess",
  origin: "user",
  width: 120,
  tool: null,
} as never;

/** S8's far side, injected — see the table below. */
const FAR = (over: Partial<Far> = {}): Far => ({
  facts: () => Promise.resolve({ image: "nginx:alpine", mounts: ["/etc/nginx/conf.d/default.conf"] }),
  running: () => Promise.resolve("a\nB\n"),
  fromImage: () => Promise.resolve("a\nb\n"),
  ...over,
});

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
  ["/ps — docker exited non-zero", () => viaRegistry(createPsAdapter(), result({ exitCode: 1, stderr: "boom" }), ctx)],
  ["/ps — docker exited non-zero, silent", () => viaRegistry(createPsAdapter(), result({ exitCode: 2 }), ctx)],
  ["/ps — ok", () => viaRegistry(createPsAdapter(), result({ stdoutRaw: read("ps-real.ndjson") }), ctx)],
  ["container stats — non-zero", () => viaRegistry(createContainerAdapter(), result({ exitCode: 1, stderr: "no such container" }), ctx)],
  ["container stats — zero rows", () => viaRegistry(createContainerAdapter(), result({ stdoutRaw: "" }), ctx)],
  ["container stats — ok", () => viaRegistry(createContainerAdapter(), result({ stdoutRaw: read("stats-real.ndjson") }), ctx)],
  // **S5's arms, added with the verb rather than after it.** Step 4's lesson
  // was that three error documents shipped, two of them never run, and 91 rows
  // agreed with all three — so a new verb's failures join this table on the day
  // the verb exists, not on the day one is seen.
  ["/inspect — docker exited non-zero", () => viaRegistry(createInspectAdapter(), result({ exitCode: 1, stderr: "No such object" }), ctx)],
  ["/inspect — exit zero, empty array", () => viaRegistry(createInspectAdapter(), result({ stdoutRaw: "[]" }), ctx)],
  ["/inspect — exit zero, unparseable", () => viaRegistry(createInspectAdapter(), result({ stdoutRaw: "<html>" }), ctx)],
  ["/inspect --raw — ok", () => viaRegistry(createInspectAdapter(), result({ stdoutRaw: read("inspect-raw-probe.json"), argv: ["docker", "inspect", "x", "--raw"] }), ctx)],
  ["/inspect — ok", () => viaRegistry(createInspectAdapter(), result({ stdoutRaw: read("inspect-raw-probe.json") }), ctx)],
  // S8's arms. The far side is injected so every one of them is reachable —
  // three of these are daemon states that occur only sometimes, and an arm that
  // cannot be driven is an arm that never runs.
  ["/config — no container", () => createConfigHandler(FAR({ facts: () => Promise.resolve(null) }))(["nope", "/x"], { command: "/config nope /x" })],
  ["/config — no path, with candidates", () => createConfigHandler(FAR())(["dtui-cfg"], { command: "/config dtui-cfg" })],
  ["/config — no path, no mounts", () => createConfigHandler(FAR({ facts: () => Promise.resolve({ image: "i", mounts: [] }) }))(["c"], { command: "/config c" })],
  ["/config — no arguments", () => createConfigHandler(FAR())([], { command: "/config" })],
  ["/config — the running file is unreadable", () => createConfigHandler(FAR({ running: () => Promise.resolve(null) }))(["c", "/x"], { command: "/config c /x" })],
  ["/config — the image side is unavailable", () => createConfigHandler(FAR({ fromImage: () => Promise.resolve(null) }))(["c", "/x"], { command: "/config c /x" })],
  ["/config — the files agree", () => createConfigHandler(FAR({ fromImage: () => Promise.resolve("a\nb\n") }))(["c", "/x"], { command: "/config c /x" })],
  ["/config — ok", () => createConfigHandler(FAR())(["c", "/x.conf"], { command: "/config c /x.conf" })],
  // S10 and S11's arms. **Four verbs is four more failure arms nobody reaches
  // by accident**, which is why they arrive with the verbs rather than after
  // the first time one is seen — step 4's lesson, applied ahead of the defect
  // rather than behind it.
  ["/diff — no such container", () => viaRegistry(createDiffAdapter(), result({ exitCode: 1, stderr: "No such container: nope" }), ctx)],
  ["/diff — nothing changed", () => viaRegistry(createDiffAdapter(), result({ stdoutRaw: "" }), ctx)],
  ["/diff — ok", () => viaRegistry(createDiffAdapter(), result({ stdoutRaw: read("diff-real.txt") }), ctx)],
  ["/images — daemon unreachable", () => viaRegistry(createImagesAdapter(), result({ exitCode: 1, stderr: "Cannot connect to the Docker daemon" }), ctx)],
  ["/images — exit zero, unreadable", () => viaRegistry(createImagesAdapter(), result({ stdoutRaw: "<html>" }), ctx)],
  ["/images — ok", () => viaRegistry(createImagesAdapter(), result({ stdoutRaw: read("images-real.ndjson") }), ctx)],
  ["/top — container not running", () => viaRegistry(createTopAdapter(), result({ exitCode: 1, stderr: "container abc is not running" }), ctx)],
  ["/top — exit zero, no header", () => viaRegistry(createTopAdapter(), result({ stdoutRaw: "\n" }), ctx)],
  ["/top — ok", () => viaRegistry(createTopAdapter(), result({ stdoutRaw: read("top-real.txt") }), ctx)],
  ["/port — no such container", () => viaRegistry(createPortAdapter(), result({ exitCode: 1, stderr: "No such container: nope" }), ctx)],
  ["/port — nothing published", () => viaRegistry(createPortAdapter(), result({ stdoutRaw: "" }), ctx)],
  ["/port — ok", () => viaRegistry(createPortAdapter(), result({ stdoutRaw: read("port-real.txt") }), ctx)],
  ["/events — the daemon is unreachable", () => createEventsHandler(() => Promise.reject(new Error("down")))([], { command: "/events" })],
  ["/events — no lifecycle events at all", () => createEventsHandler(() => Promise.resolve(""))([], { command: "/events" })],
  ["/events — ok", () => createEventsHandler(() => Promise.resolve(read("events-real.ndjson")))([], { command: "/events" })],
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
