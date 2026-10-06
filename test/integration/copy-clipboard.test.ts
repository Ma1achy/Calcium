// C14 I61, C17 I31 — the clipboard in a real session (ruling 72).
//
// Three sessions, one per destination, because the destination is decided by
// what the session was built with — a capability and a `PATH` — and not by
// anything a key can change. Each copy is read at its destination and at the
// kill buffer, and the two must be the same text (C17 I31).
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { createEditor } from "../../src/interaction/editor/editor.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { COPY_DEADLINE_MS } from "../../src/shell/clipboard.js";

const ESC = "\u001b";
const ENTER_MODE = `${ESC}V`;
const CTRL_Y = "\u0019";

const tool = (name: string) => ({ name, local: true, summary: name, args: [], flags: [] });
const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  note: () => ({ schema: "tui.view/1", command: "note", status: "ok", blocks: [{ kind: "text", id: "t", text: "two words" } as never] }),
};
const MANIFEST: NonNullable<TuiConfig["manifest"]> = { schema: "tui.manifest/1", binary: "prism", version: "1.0.0", tools: [tool("note")] };

/** `ESC ] 52 ; c ; <base64> BEL`, decoded — or every payload, in order. */
const payloads = (chunks: readonly string[]): string[] =>
  [...chunks.join("").matchAll(/\u001b\]52;c;([A-Za-z0-9+/=]*)\u0007/gu)].map((m) => Buffer.from(m[1] ?? "", "base64").toString("utf8"));

async function session(over: Partial<TuiConfig> = {}, columns = 100) {
  const stdin = fakeStdin();
  const built = await buildSession({ manifest: MANIFEST, localHandlers: HANDLERS, stdin: stdin as never, ...over }, { columns, rows: 30 });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
  };
  const press = async (keys: string): Promise<void> => {
    stdin.emit(keys);
    await settle();
  };
  const toast = (text: string): boolean => built.screen().rows.some((r) => r.includes(text));
  const footer = (): string => [...built.screen().rows].reverse().find((r) => /^copy {2}/u.test(r))?.trimEnd() ?? "<not in copy mode>";
  await settle();
  return { ...built, press, settle, toast, footer };
}

/** The text every copy handed the kill buffer, in order. */
function spyCopies() {
  const proto = Object.getPrototypeOf(createEditor()) as { copyText: (t: string) => void };
  return vi.spyOn(proto, "copyText");
}

describe("C14 §6a — the clipboard in a real session", () => {
  it("T4.43 (C14 I61, C17 I31): OSC 52 declared, a pbcopy on PATH, and neither — each copy reaches its destination and says so", async () => {
    const spy = spyCopies();
    try {
      // **OSC 52** — declared, as a reader whose terminal takes it would (C02 I18).
      const o = await session({ capabilities: { clipboard: "osc52" } });
      await o.press("/note\r");
      await o.press(ENTER_MODE);
      expect(o.footer(), "a clipboard exists, so the key copies").toContain("⏎ copy");
      await o.press("a");
      const before = o.stdout.chunks.length;
      await o.press("y");
      const copied = spy.mock.calls.at(-1)?.[0];
      expect(copied, "the copy is the entry's text").toContain("two words");
      expect(payloads(o.stdout.chunks.slice(before)), "one OSC 52 write, of exactly the copied text").toEqual([copied]);
      expect(o.toast("sent to the terminal's clipboard"), "sent, never copied").toBe(true);
      expect(o.toast("copied")).toBe(false);
      expect(o.footer(), "K1: sent counts as done, so nothing offers a file").toContain("⏎ copy");

      // **A tool** — a `pbcopy` that writes its stdin to a file, on a `PATH`
      // holding nothing else. Absolute, because the tool's own `PATH` is this one.
      const dir = mkdtempSync(join(tmpdir(), "calcium-pbcopy-"));
      const out = join(dir, "pasteboard");
      writeFileSync(join(dir, "pbcopy"), `#!/bin/sh\nexec /bin/cat > "${out}"\n`);
      chmodSync(join(dir, "pbcopy"), 0o755);
      // **A real working directory**: the harness's `/work` does not exist, and
      // a spawn there fails ENOENT — which the first run of this row showed as
      // `pbcopy failed (spawn … ENOENT)`, the W11 path saying so rather than the
      // tool.
      const t = await session({ env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: dir }, cwd: dir });
      await t.press("/note\r");
      await t.press(ENTER_MODE);
      await t.press("a");
      await t.press("y");
      // The pending sentence is T3.26's: a `cat` answers inside the settle, so
      // the frame that would have drawn it has already been replaced.
      await vi.waitFor(() => expect(t.toast("copied via pbcopy")).toBe(true), { timeout: 5_000 });
      expect(readFileSync(out, "utf8"), "the tool took exactly the kill buffer's text").toBe(spy.mock.calls.at(-1)?.[0]);
      expect(t.footer(), "K5: a route that worked offers nothing").toContain("⏎ copy");

      // **Neither** — the footer says so at rest, and ⏎ takes the offer.
      const n = await session();
      await n.press("/note\r");
      await n.press(ENTER_MODE);
      expect(n.footer(), "offered before the press").toContain("⏎ to file");
      expect(n.footer(), "and stated, last of the facts").toMatch(/the screen is frozen {2}no clipboard/u);
      await n.press("a");
      const fs = (n.tui as unknown as { config: { fs: { readFile: (p: string) => Promise<string> } } }).config.fs;
      // **K13 — `y` is not the offer**: said, and nothing written.
      await n.press("y");
      expect(n.toast("no clipboard here — the kill buffer holds it")).toBe(true);
      await expect(fs.readFile("/state/copy.txt"), "y wrote nothing").rejects.toBeDefined();
      await n.press("\r");
      expect(n.toast("saved to /state/copy.txt")).toBe(true);
      expect(await fs.readFile("/state/copy.txt"), "the file holds the kill buffer's text").toBe(spy.mock.calls.at(-1)?.[0]);
      expect(existsSync(out)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("T4.44 (C14 I61): a pending copy's deadline is disposed when the session stops", async () => {
    // **A tool that takes the text and does not answer** — alive for three
    // seconds, past `COPY_DEADLINE_MS`. It runs to its end detached (C21 I2);
    // the row asserts the deadline, not the process.
    //
    // **The timer itself, read at the ambient's `setTimeout`** (amended
    // 2026-09-29). This row read *no `copy.txt` past the deadline*, a proxy
    // that held only while the deadline wrote a file; with no automatic write
    // an undisposed deadline leaves no file either, and the row passed with the
    // dispose removed. The session's `schedule` has no injection point in a
    // real session, so the global pair is spied — the ambient calls it by name.
    const dir = mkdtempSync(join(tmpdir(), "calcium-pbcopy-"));
    writeFileSync(join(dir, "pbcopy"), "#!/bin/sh\n/bin/cat > /dev/null\nexec /bin/sleep 3\n");
    chmodSync(join(dir, "pbcopy"), 0o755);
    const t = await session({ env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: dir }, cwd: dir });
    await t.press("/note\r");
    await t.press(ENTER_MODE);
    await t.press("a");
    const set = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    try {
      await t.press("y");
      expect(t.toast("copying with pbcopy"), "the copy is pending when the session stops").toBe(true);
      // **Every timer at the deadline's length the `y` armed** — the toast's
      // expiry is the same 2 000 ms and is armed by the same press, and no
      // property of a handle tells the two apart. Neither may outlive the stop,
      // so the row asks that of both; the toast's is C22 I116's.
      const armed = set.mock.calls.flatMap((call, i) => (call[1] === COPY_DEADLINE_MS ? [set.mock.results[i]?.value] : []));
      expect(armed.length, "the deadline and the toast's expiry").toBeGreaterThanOrEqual(2);
      const live = (): unknown[] => armed.filter((h) => !clear.mock.calls.some(([c]) => c === h));
      expect(live().length, "the deadline is live while the copy is pending").toBeGreaterThanOrEqual(1);
      await t.tui.stop("exit");
      expect(live(), "the deadline was disposed with the session").toEqual([]);
    } finally {
      set.mockRestore();
      clear.mockRestore();
    }
  }, 10_000);

  it("T4.45 (C14 I61, §6e K7, K9, K10, K16): a pbcopy exiting 1 offers the file for that copy and writes nothing until ⏎", async () => {
    const dir = mkdtempSync(join(tmpdir(), "calcium-pbcopy-"));
    writeFileSync(join(dir, "pbcopy"), "#!/bin/sh\n/bin/cat > /dev/null\nexit 1\n");
    chmodSync(join(dir, "pbcopy"), 0o755);
    // **K16 — a relative `stateDir`**, as the default is, so the path the
    // toast states is the one the session resolved.
    // **120 columns**, because the reason is the last fact and the line sheds
    // from the right: at 100 it goes first, and `⏎ to file` still says where
    // the text goes (§6e's footer table).
    const t = await session({ env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: dir }, cwd: dir, stateDir: ".calcium" }, 120);
    const fs = (t.tui as unknown as { config: { fs: { readFile: (p: string) => Promise<string> } } }).config.fs;
    const path = join(dir, ".calcium", "copy.txt");
    await t.press("/note\r");
    await t.press("/note\r");
    await t.press(ENTER_MODE);
    await t.press("a");
    expect(t.footer(), "a tool is a route: no offer before the copy").toContain("⏎ copy");
    await t.press("y");
    await vi.waitFor(() => expect(t.toast("pbcopy failed (exited with code 1) — the kill buffer holds it")).toBe(true), {
      timeout: 5_000,
    });
    // **K7** — said, offered, and nothing written.
    await expect(fs.readFile(path), "the failure wrote nothing").rejects.toBeDefined();
    expect(t.footer(), "the offer, for that copy").toContain("⏎ to file");
    expect(t.footer(), "and its reason, last of the facts").toContain("pbcopy failed");
    // **K10** — another text is another copy: the offer is withdrawn, and
    // returns when the selection is that copy's again — the caret back on the
    // entry and `a`, since a shrink selects a block rather than the entry.
    await t.press("\u001b[1;2A");
    expect(t.footer(), "extended: not that copy").toContain("⏎ copy");
    await t.press("\u001b[1;2B");
    await t.press("a");
    expect(t.footer(), "the entry again: that copy's text").toContain("⏎ to file");
    // **K9** — the offer taken writes the text, and states the absolute path.
    await t.press("\r");
    expect(t.toast(`saved to ${path}`), "the full path").toBe(true);
    expect(await fs.readFile(path), "the file holds the copy").toContain("two words");
  }, 10_000);

  it("T4.8 (C17 I31): a copy sent by OSC 52, then ⌃y → the prompt holds the text the payload decodes to", async () => {
    const o = await session({ capabilities: { clipboard: "osc52" } });
    await o.press("/note\r");
    await o.press(ENTER_MODE);
    await o.press("a");
    await o.press("\r");
    const [sent] = payloads(o.stdout.chunks);
    expect(sent, "the clipboard received the entry").toContain("two words");
    await o.press(CTRL_Y);
    const rows = o.screen().rows;
    const rules = rows.flatMap((r, i) => (/^─+$/u.test(r.trim()) ? [i] : []));
    const [x, y] = rules.slice(-2);
    const prompt = rows.slice((x ?? 0) + 1, y).map((r) => r.trimEnd()).join("\n");
    // The prompt draws the yank under its gutter, so each of the payload's lines
    // is found on a prompt row rather than the block compared whole.
    for (const line of (sent ?? "").split("\n").filter((l) => l !== "")) {
      expect(prompt, `⌃y yanks what the clipboard received: ${line}`).toContain(line);
    }
  });
});
