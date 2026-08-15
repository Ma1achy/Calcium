// C13 I20 — session resume, as an arc rather than as a mechanism.
//
// **The unit rows call the writer; nothing calls the wiring.** Three failures
// pass every one of them, and each is a *removal* rather than a wrong answer:
// the subscription registered before the resume loop, so loading rewrites what
// it read; the writer never reaching `beforeRelease`, so nothing flushes at
// exit; the policy resolved before the manifest is loaded, so every verb reads
// as undeclared and the file stays empty. A seam-level row passes on the day
// nothing calls it (`test/support/README.md`), and this is the tier that can
// tell.
//
// The arc is: start · run a declared verb · stop · start · see the entry.
import { describe, expect, it } from "vitest";
import { buildSession, fakeFs } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { FileSystem, TuiConfig } from "../../src/shell/types.js";

const PATH = "/state/transcript.ndjson";

/** One verb that declares persistence and one that does not — the pair is the test. */
const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "keep", local: true, summary: "declared", args: [], flags: [], persist: true },
    { name: "drop", local: true, summary: "undeclared", args: [], flags: [] },
  ],
};

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  keep: () => ({
    schema: "tui.view/1",
    command: "keep",
    status: "ok",
    blocks: [{ kind: "raw", id: "k", text: "KEPT-OUTPUT" }],
  }),
  drop: () => ({
    schema: "tui.view/1",
    command: "drop",
    status: "ok",
    blocks: [{ kind: "raw", id: "d", text: "DROPPED-OUTPUT" }],
  }),
};

/**
 * A session over a shared filesystem, with the keyboard reachable.
 *
 * **Bytes into stdin, not a call into the pipeline** (C22 I24): the arc under
 * test includes the submit path, and a test that drove execution directly would
 * be asserting about a mechanism rather than about a session.
 */
async function session(fs: FileSystem, extra: Partial<TuiConfig> = {}) {
  const stdin = fakeStdin();
  const built = await buildSession({
    fs,
    manifest: MANIFEST,
    localHandlers: handlers,
    stdin: stdin as unknown as NodeJS.ReadStream,
    ...extra,
  });
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };
  return { ...built, type };
}

describe("C13 I20 — the resume arc", () => {
  it("T4.37 (C13 I20): a declared verb's output survives a restart and an undeclared one does not", async () => {
    const fs = fakeFs();

    const first = await session(fs);
    await first.type("/keep\r");
    await first.type("/drop\r");
    await first.tui.stop("exit");

    // The file is the intermediate artefact and it is worth asserting directly:
    // a screen that is missing an entry cannot say whether it was never written
    // or never read.
    const written = await fs.readFile(PATH);
    expect(written, "the declared verb reached disk").toContain("KEPT-OUTPUT");
    expect(written, "and the undeclared one did not").not.toContain("DROPPED-OUTPUT");

    const second = await session(fs);
    const screen = second.screen().rows.join("\n");
    expect(screen, "and it is on screen in the new session").toContain("KEPT-OUTPUT");
    expect(screen, "with the undeclared verb still absent").not.toContain("DROPPED-OUTPUT");
    await second.tui.stop("exit");
  });

  it("T4.38 (C13 I20): resuming does not rewrite what it read", async () => {
    // **The subscription is registered after the resume loop**, and nothing but
    // this row says so. Registered before it, every loaded document is appended
    // to the transcript, every append fires the subscription, and the file
    // doubles on each start — silently, because a resumed session showing each
    // entry twice looks like a session that ran each command twice.
    const fs = fakeFs();

    const first = await session(fs);
    await first.type("/keep\r");
    await first.tui.stop("exit");

    const after = (text: string): number =>
      text.split("\n").filter((l) => l !== "").length;
    expect(after(await fs.readFile(PATH)), "one entry after one run").toBe(1);

    for (let i = 0; i < 3; i += 1) {
      const s = await session(fs);
      await s.tui.stop("exit");
    }

    expect(
      after(await fs.readFile(PATH)),
      "three restarts that ran nothing leave one entry, not eight",
    ).toBe(1);
  });

  it("T4.40a (C13 I20): the exit path is what writes an entry still in flight", async () => {
    // **The mutation pass is what asked for this row.** Removing the writer
    // from `beforeRelease` failed nothing, because the fake filesystem confirms
    // an append on the next microtask and the arc above awaits several — so the
    // async path had always already written, and *drain* was decoration in
    // every assertion that existed.
    //
    // Issued-but-unconfirmed is the entry the user just ran. Here the append is
    // held open, so the only route to disk is the synchronous one.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = fakeFs();
    const slow: FileSystem = {
      ...base,
      appendFile: async (path: string, data: string) => {
        await held;
        await base.appendFile(path, data);
      },
    };

    const only = await session(slow);
    await only.type("/keep\r");
    await only.tui.stop("exit");

    expect(
      await slow.readFile(PATH),
      "the held append never landed, so this is `drain`'s row or nothing's",
    ).toContain("KEPT-OUTPUT");
    release?.();
  });

  it("T4.39 (C13 I20): an app that declares no policy writes no file at all", async () => {
    // The default, at the level where it matters. `persist` is absent from the
    // config and no verb declares it, so nothing is created — not an empty
    // file, which would be a feature that ran and found nothing to say.
    const fs = fakeFs();
    const bare: NonNullable<TuiConfig["manifest"]> = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [{ name: "keep", local: true, summary: "undeclared", args: [], flags: [] }],
    };

    const stdin = fakeStdin();
    const only = await buildSession({
      fs,
      manifest: bare,
      // Only the verb this manifest declares — C23 I27 refuses a handler with
      // no verb, which is a different finding and not this row's.
      localHandlers: { keep: handlers["keep"] as NonNullable<TuiConfig["localHandlers"]>[string] },
      stdin: stdin as unknown as NodeJS.ReadStream,
    });
    stdin.emit("/keep\r");
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    await only.tui.stop("exit");

    await expect(fs.readFile(PATH), "no file, not an empty one").rejects.toThrow();
  });

  it("T4.40 (C22 I67): the state directory ignores itself", async () => {
    // One line, and it does not depend on the app author having thought of it.
    const fs = fakeFs();
    const built = await buildSession({ fs });
    await built.tui.stop("exit");

    expect(await fs.readFile("/state/.gitignore")).toBe("*\n");
  });
});
