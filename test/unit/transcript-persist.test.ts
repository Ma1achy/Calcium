// C13 I20 / C05 I25 — session resume: what is written, and what is not.
//
// **The rows that matter are the refusals.** A writer that writes is easy to
// assert and easy to get right; the ruling is about what must *not* reach disk,
// and every one of those cases is silent when it is wrong — a persisted secret
// is not visible in a frame, in a test, or in a review of the app that caused it.
import { describe, expect, it } from "vitest";
import {
  createTranscriptWriter,
  loadTranscript,
  persistPolicy,
  persists,
} from "../../src/shell/transcript-persist.js";
import type { Manifest, ToolDef } from "../../src/data/manifest/index.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";
import { fakeFs } from "../support/history.js";

const tool = (name: string, persist?: boolean): ToolDef =>
  ({
    name,
    local: false,
    summary: name,
    args: [],
    flags: [],
    ...(persist === undefined ? {} : { persist }),
  }) as ToolDef;

const manifestOf = (...tools: readonly ToolDef[]): Manifest =>
  ({ schema: "tui.manifest/1", app: "t", version: "1", tools }) as unknown as Manifest;

const docFor = (verb: string | null): ViewDocument =>
  doc({ command: verb ?? "", meta: { ...doc().meta, verb } });

const PATH = "/state/transcript.ndjson";

describe("C13 I20 — the policy", () => {
  it("T1.28 (C13 I20): an app that declares nothing persists nothing", () => {
    // **Silence is the safe answer and it is the default**, which is what makes
    // declaring the policy the thing that switches the feature on. An app that
    // never considered persistence gets none, and no explanation is owed
    // because nothing surprising happened.
    const policy = persistPolicy(manifestOf(tool("ps"), tool("logs")), {});

    expect(policy.all).toBe(false);
    expect(policy.declared.size).toBe(0);
    expect(persists(policy, docFor("ps"))).toBe(false);
  });

  it("T1.29 (C05 I25): the verb declares, and absent means no", () => {
    // The asymmetry is the ruling: `persist: true` opts in, and **every other
    // value including absence is a refusal**. A row per direction, because a
    // policy that read `!== false` would pass the first assertion alone.
    const policy = persistPolicy(manifestOf(tool("ps", true), tool("inspect"), tool("logs", false)), {});

    expect(persists(policy, docFor("ps")), "declared true").toBe(true);
    expect(persists(policy, docFor("inspect")), "absent is no").toBe(false);
    expect(persists(policy, docFor("logs")), "declared false").toBe(false);
    expect(persists(policy, docFor("unknown")), "not in the manifest at all").toBe(false);
  });

  it("T1.30 (C13 I20): `persist: \"all\"` is the one-line opt-in, and it does not need the manifest", () => {
    const policy = persistPolicy(null, { persist: "all" });

    expect(persists(policy, docFor("ps"))).toBe(true);
    expect(persists(policy, docFor("anything"))).toBe(true);
  });

  it("T1.31 (C13 I20): a document with no verb is never written, under any policy", () => {
    // The framework's own notices — a fault, a stall, the resume warning this
    // very module can emit — carry `meta.verb: null`. No verb declared them, so
    // no verb can have opted them in, and `"all"` must not sweep them up: they
    // describe a session that is over.
    const all = persistPolicy(null, { persist: "all" });

    expect(persists(all, docFor(null))).toBe(false);
    expect(persists(all, docFor("")), "the empty verb with it").toBe(false);
  });
});

describe("C13 I20 — the writer", () => {
  it("T1.32 (C13 I20): a document is one line, and it comes back the document that was written", async () => {
    // C04 I46 is what this rests on. `JSON.stringify` escapes every control
    // character, so a newline **inside** a block's text cannot end a row — which
    // is the whole reason there is no index-aligned sidecar here.
    const fs = fakeFs();
    const writer = createTranscriptWriter(fs, PATH);
    const multiline = doc({
      command: "ps",
      meta: { ...doc().meta, verb: "ps" },
      blocks: [{ kind: "raw", id: "r", text: "two\nlines" }],
    });

    writer.write(multiline);
    await writer.flush();

    expect(fs.files.get(PATH)?.split("\n").filter((l) => l !== "").length, "one row").toBe(1);

    const loaded = await loadTranscript(fs, PATH);
    expect(loaded.discarded).toBe(0);
    expect(loaded.docs).toEqual([multiline]);
  });

  it("T1.33 (C13 I20): a failed write rewinds rather than drops, and the next one catches up", async () => {
    // C20's policy, carried. The row that matters is the *second* document: a
    // writer that dropped the first would leave a file missing an entry with
    // nothing anywhere saying so.
    const fs = fakeFs();
    const writer = createTranscriptWriter(fs, PATH);

    fs.fail("readOnly");
    writer.write(docFor("ps"));
    await writer.flush();
    expect(fs.files.get(PATH), "nothing landed").toBeUndefined();

    fs.fail("none");
    writer.write(docFor("logs"));
    await writer.flush();

    const loaded = await loadTranscript(fs, PATH);
    expect(loaded.docs.map((d) => d.meta.verb), "both, in order").toEqual(["ps", "logs"]);
    expect(writer.warnings.length, "and it said so once").toBe(1);
  });

  it("T1.34 (C13 I20): `drain` writes from the last CONFIRMED write, not the last issued", async () => {
    // **The state this needs is `issued > confirmed`, and the obvious fixture
    // cannot construct it.** Written as *write, then drain*, both counters are
    // still 0 — `pump` advances `issued` inside the chain, which has not run —
    // so drain-from-issued and drain-from-confirmed slice identically and the
    // row passes for either. The mutation pass is what said so.
    //
    // Issued-but-unconfirmed is a write **in flight**: `issued` advanced, the
    // append not yet resolved. That is exactly the entry the user just ran, and
    // it is the one the exit path exists for, so the fixture holds an append
    // open rather than letting it settle.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const files = new Map<string, string>();
    const fs = {
      readFile: async (p: string) => {
        const t = files.get(p);
        if (t === undefined) throw new Error("ENOENT");
        return t;
      },
      writeFile: async (p: string, d: string) => void files.set(p, d),
      appendFile: async (p: string, d: string) => {
        await held;
        files.set(p, (files.get(p) ?? "") + d);
      },
      appendFileSync: (p: string, d: string) => void files.set(p, (files.get(p) ?? "") + d),
    };

    const writer = createTranscriptWriter(fs, PATH);
    writer.write(docFor("ps"));
    // Let the chain body reach the `await` — `issued` is now 1 and `confirmed`
    // is still 0, which is the only window where the two answers differ.
    await Promise.resolve();
    await Promise.resolve();

    writer.drain();
    expect(files.get(PATH), "the in-flight entry reached disk synchronously").toBeDefined();
    const drained = await loadTranscript(fs, PATH);
    expect(drained.docs.map((d) => d.meta.verb)).toEqual(["ps"]);

    // And when the held append lands it must not write the row a second time.
    release?.();
    await writer.flush();
    const after = await loadTranscript(fs, PATH);
    expect(after.docs.length, "not written twice").toBe(1);
  });

  it("T1.35 (C13 I20): seeding holds the loaded documents, because compaction rewrites from them", async () => {
    // **The defect a count would produce is data loss, not inefficiency.**
    // Compaction rewrites the file from what the writer holds, so a writer
    // seeded with a number replaces the whole file with this session's handful.
    // The cap is passed small so the rewrite actually happens.
    const fs = fakeFs();
    const writer = createTranscriptWriter(fs, PATH, 3);
    writer.seed([
      { seq: 5, doc: docFor("a") },
      { seq: 6, doc: docFor("b") },
    ]);

    writer.write(docFor("c"));
    writer.write(docFor("d"));
    await writer.flush();

    const loaded = await loadTranscript(fs, PATH);
    expect(
      loaded.docs.map((d) => d.meta.verb),
      "the oldest is dropped and the rest survive the rewrite",
    ).toEqual(["b", "c", "d"]);
  });

  it("T1.39 (C13 I20): a resumed session continues the file's sequence, it does not restart it", async () => {
    // **The defect this refuses is an ordering one and the trace did not reach
    // it.** A writer seeded with documents alone renumbers from 1, so a session
    // resuming a file whose rows are 5 and 6 appends `seq` 3 — and the next
    // load sorts the newest entry above the two it followed. Found by reading
    // the diff rather than by a failing row.
    const fs = fakeFs();
    const writer = createTranscriptWriter(fs, PATH);
    await fs.writeFile(
      PATH,
      [
        JSON.stringify({ seq: 5, doc: docFor("a") }),
        JSON.stringify({ seq: 6, doc: docFor("b") }),
        "",
      ].join("\n"),
    );

    const first = await loadTranscript(fs, PATH);
    writer.seed(first.rows);
    writer.write(docFor("c"));
    await writer.flush();

    const again = await loadTranscript(fs, PATH);
    expect(again.docs.map((d) => d.meta.verb), "the newest is last").toEqual(["a", "b", "c"]);
  });

  it("T1.36 (C13 I20): a damaged line is dropped, counted, and the rest are kept", async () => {
    // C20's repair policy rather than its own: a session that refuses to start
    // because one line has a stray byte in it has made a convenience into a
    // dependency. The count is what stops the loss being silent — F35's class.
    const fs = fakeFs();
    const row = (seq: number, verb: string): string => JSON.stringify({ seq, doc: docFor(verb) });
    await fs.writeFile(
      PATH,
      [
        row(1, "ps"),
        "not json at all",
        '{"seq":3,"doc":{"schema":"tui.view/1"}}',
        JSON.stringify({ doc: docFor("logs") }),
        row(4, "images"),
        "",
      ].join("\n"),
    );

    const loaded = await loadTranscript(fs, PATH);

    expect(loaded.docs.map((d) => d.meta.verb), "the two readable ones, in seq order").toEqual([
      "ps",
      "images",
    ]);
    expect(
      loaded.discarded,
      "the unparseable, the invalid document and the row with no seq",
    ).toBe(3);
  });

  it("T1.38 (C13 I20): a duplicated row collapses on load, which is what makes `drain` safe", async () => {
    // **The writer tolerates a duplicate and the reader removes it**, which is
    // C20's division and the reason the envelope carries a sequence number at
    // all. `drain` writes rows the chain had already issued, because
    // issued-but-unconfirmed is the entry the user just ran — so the same row
    // can land twice, and without a key there is nothing to collapse it by.
    const fs = fakeFs();
    const line = JSON.stringify({ seq: 1, doc: docFor("ps") });
    await fs.writeFile(PATH, `${line}\n${line}\n`);

    const loaded = await loadTranscript(fs, PATH);

    expect(loaded.docs.length, "one entry, not two").toBe(1);
    expect(loaded.discarded, "and a duplicate is not damage").toBe(0);
  });

  it("T1.37 (C13 I20): an absent file is an empty resume and not an error", async () => {
    const loaded = await loadTranscript(fakeFs(), PATH);
    expect(loaded.docs).toEqual([]);
    expect(loaded.discarded).toBe(0);
  });
});
