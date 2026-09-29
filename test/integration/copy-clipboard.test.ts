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

async function session(over: Partial<TuiConfig> = {}) {
  const stdin = fakeStdin();
  const built = await buildSession({ manifest: MANIFEST, localHandlers: HANDLERS, stdin: stdin as never, ...over }, { columns: 100, rows: 30 });
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

      // **A tool** — a `pbcopy` that writes its stdin to a file, on a `PATH`
      // holding nothing else. Absolute, because the tool's own `PATH` is this one.
      const dir = mkdtempSync(join(tmpdir(), "calcium-pbcopy-"));
      const out = join(dir, "pasteboard");
      writeFileSync(join(dir, "pbcopy"), `#!/bin/sh\nexec /bin/cat > "${out}"\n`);
      chmodSync(join(dir, "pbcopy"), 0o755);
      // **A real working directory**: the harness's `/work` does not exist, and
      // a spawn there fails ENOENT — which the first run of this row showed as
      // `pbcopy failed (spawn … ENOENT) — saved to /state/copy.txt`, the W11
      // path saying so rather than the tool.
      const t = await session({ env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", PATH: dir }, cwd: dir });
      await t.press("/note\r");
      await t.press(ENTER_MODE);
      await t.press("a");
      await t.press("y");
      // The pending sentence is T3.26's: a `cat` answers inside the settle, so
      // the frame that would have drawn it has already been replaced.
      await vi.waitFor(() => expect(t.toast("copied to the clipboard by pbcopy")).toBe(true), { timeout: 5_000 });
      expect(readFileSync(out, "utf8"), "the tool took exactly the kill buffer's text").toBe(spy.mock.calls.at(-1)?.[0]);

      // **Neither** — the footer says so at rest, and ⏎ takes the offer.
      const n = await session();
      await n.press("/note\r");
      await n.press(ENTER_MODE);
      expect(n.footer(), "offered before the press").toContain("⏎ to file");
      expect(n.footer(), "and stated, last of the facts").toMatch(/the screen is frozen {2}no clipboard/u);
      await n.press("a");
      await n.press("\r");
      expect(n.toast("no clipboard here — saved to /state/copy.txt")).toBe(true);
      const fs = (n.tui as unknown as { config: { fs: { readFile: (p: string) => Promise<string> } } }).config.fs;
      expect(await fs.readFile("/state/copy.txt"), "the file holds the kill buffer's text").toBe(spy.mock.calls.at(-1)?.[0]);
      expect(existsSync(out)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

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
