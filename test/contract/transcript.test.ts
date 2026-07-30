// C13 tier 2 — contract. The interface C14, C16 and L4 are written against, and
// the two things a source scan sees that a behavioural test cannot.
//
// **T2.2 and T2.4 each fabricate their own violation inline**, on top of the
// suite-level fabrication table. A scan that matches nothing passes exactly like a
// scan that is satisfied, and `src/viewport/transcript.ts` was a file until this
// commit — which is the shape (A03 §2) that let SS3 and SS26 report compliance for
// the whole life of the project.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { appendPatch, docOf } from "../support/transcript.js";
import { doc } from "../support/blocks.js";
import type { Change, TranscriptView } from "../../src/viewport/transcript/index.js";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

const SOURCES = walk("src/viewport");

describe("C13 contract", () => {
  it("T2.1 (I11): entries is immutable; mutation attempts do not change the store", () => {
    const s = createTranscriptStore();
    s.append(doc());
    const entries = s.entries;

    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
    expect(() => (entries as unknown as unknown[]).push({})).toThrow();
    expect(s.entries).toHaveLength(1);

    // Every mutation produces new values rather than editing in place, which is
    // what lets C14 hold a reference across a frame and compare it.
    const before = s.entries;
    s.append(doc());
    expect(s.entries).not.toBe(before);
    expect(before).toHaveLength(1);
  });

  it("T2.2 (I9): no clock read anywhere in viewport/, and the rule can see this directory", () => {
    expect(checkSourceScans(SOURCES).filter((v) => v.rule === "SS4")).toEqual([]);

    // The scope is real: SS4 named `transcript/` while the tree held
    // `transcript.ts`, a file, so `startsWith` matched nothing and the rule
    // reported compliance without ever being evaluated.
    const fabricated = checkSourceScans(["src/viewport/transcript/store.ts"], (file) =>
      file === "src/viewport/transcript/store.ts"
        ? "const seq = Date.now();"
        : readFileSync(file, "utf8"),
    ).filter((v) => v.rule === "SS4");
    expect(fabricated).toHaveLength(1);
  });

  it("T2.3 (I3): across a thousand appends and evictions, no id repeats", () => {
    const s = createTranscriptStore({ cap: 20 });
    const seen = new Set<string>();

    for (let i = 0; i < 1_000; i += 1) {
      const id = s.append(docOf(3, `d${i}`));
      expect(seen.has(id), `id ${id} reused at ${i}`).toBe(false);
      seen.add(id);
      if (i % 100 === 0) s.clear();
    }

    expect(seen.size).toBe(1_000);
  });

  it("T2.4 (I18): the module graph shows no import from terminal/ or presentation/", () => {
    expect(checkModuleGraph(SOURCES).filter((v) => v.rule === "MG10")).toEqual([]);

    // Both edges go *downward*, so MG1 permits them and MG2 sees no cycle. That
    // is why the fabrication matters more here than usual: nothing else in the
    // suite would report either of these.
    for (const source of [
      'import { createBlockRegistry } from "../../presentation/blocks/index.js";',
      'import type { TerminalSize } from "../../terminal/lifecycle.js";',
    ]) {
      const fabricated = checkModuleGraph(["src/viewport/transcript/store.ts"], (file) =>
        file === "src/viewport/transcript/store.ts" ? source : readFileSync(file, "utf8"),
      ).filter((v) => v.rule === "MG10");
      expect(fabricated, source).toHaveLength(1);
    }
  });

  it("T2.5 (I12): subscribe returns a disposable; disposing stops delivery mid-stream", () => {
    const s = createTranscriptStore();
    const seen: Change[] = [];
    const sub = s.subscribe((c) => void seen.push(c));

    const id = s.append(docOf(1), { streaming: true });
    s.patch(id, appendPatch("a"));
    expect(seen).toHaveLength(2);

    sub[Symbol.dispose]();

    s.patch(id, appendPatch("b"));
    s.settle(id);
    s.clear();
    expect(seen).toHaveLength(2);
  });

  it("T2.6: every Change variant is emitted by at least one operation", () => {
    const s = createTranscriptStore({ cap: 2 });
    const kinds = new Set<Change["kind"]>();
    s.subscribe((c) => void kinds.add(c.kind));

    const id = s.append(docOf(1, "a"), { streaming: true });
    s.patch(id, appendPatch("x"));
    s.settle(id);
    s.append(docOf(4, "b")); // forces an eviction
    s.clear();

    // Exhaustive over the union. A variant nothing emits is a variant C14 has
    // written a branch for and will never take.
    expect([...kinds].sort()).toEqual(["append", "clear", "evict", "patch", "settle"]);
  });

  it("T2.7 (I19): TranscriptView exposes no mutator and no payloadOf", () => {
    // A compile-level assertion. `npm run check` type-checks `test/`, so each
    // `@ts-expect-error` below fails the *build* if it stops being an error —
    // which is what widening a consumer's parameter back to `TranscriptStore`
    // would do. A runtime check could not see it: the object passed at runtime
    // is the store, and it has every one of these.
    const view: TranscriptView = createTranscriptStore();

    // @ts-expect-error — a reader cannot append.
    void view.append;
    // @ts-expect-error — a reader cannot patch.
    void view.patch;
    // @ts-expect-error — a reader cannot settle.
    void view.settle;
    // @ts-expect-error — a viewport recomputing an anchor by emptying the
    // transcript is a fix that works, ships, and is found from a bug report.
    void view.clear;
    // @ts-expect-error — §5a's debug window is L4's, not a reader's.
    void view.payloadOf;
    // @ts-expect-error — droppedBlocks is the store's bookkeeping.
    void view.droppedBlocks;

    // What a reader does get.
    expect(view.entries).toEqual([]);
    expect(view.liveId).toBeNull();
    expect(view.blockCount).toBe(0);
    expect(view.overCap).toBe(0);
    expect(typeof view.subscribe).toBe("function");
  });

  it("T2.8 (I15, I17): the reported numbers are the ones a consumer can act on", () => {
    // C14 and L4 read these four and nothing else. Asserting their relationship
    // here rather than only inside the cap tests is what makes them a contract
    // rather than an implementation detail that happens to hold.
    const s = createTranscriptStore({ cap: 4 });
    s.append(docOf(3, "a"));
    s.append(docOf(3, "b"));

    expect(s.blockCount).toBe(s.entries.reduce((n, e) => n + e.blocks, 0));
    expect(s.overCap).toBe(Math.max(0, s.blockCount - 4));
    expect(s.liveId).toBe(s.entries.at(-1)?.id);
  });
});
