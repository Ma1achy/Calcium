// C22 I153 through a built session (§6t, F1483).
//
// **Read off the screen at the rung**, because the fold is one mechanism at the
// one place every drawn character passes, and the screen is where a message built
// anywhere in `src/` arrives. A document carrying a producer's own em dash and a
// refused document — whose notice is framework prose, built from a validator
// message — is drawn at `LANG=C` and at UTF-8.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "prose", local: true, summary: "a notice with a producer's own dash", args: [], flags: [] },
    { name: "bad", local: true, summary: "a document the validator refuses", args: [], flags: [] },
  ],
};

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  prose: (() => ({
    schema: "tui.view/1",
    command: "prose",
    status: "ok",
    blocks: [
      { kind: "notice", id: "n", tone: "warn", glyph: "warn", text: "disk full — retry · later" },
    ],
  })) as never,
  // A warn notice with no glyph: the validator refuses it, and the refusal is a
  // framework message whose text carries a dash.
  bad: (() => ({
    schema: "tui.view/1",
    command: "bad",
    status: "ok",
    blocks: [{ kind: "notice", id: "n", tone: "warn", text: "x" }],
  })) as never,
};

const MARKS = [..."—§·×≤≥→«»⚠"];

const screenAt = async (lang: string): Promise<string> => {
  const stdin = fakeStdin();
  const session = await buildSession(
    {
      manifest: MANIFEST,
      localHandlers: handlers,
      stdin: stdin as unknown as NodeJS.ReadStream,
      env: { TERM: "xterm-256color", LANG: lang },
    },
    { columns: 100, rows: 24 },
  );
  for (const line of ["/prose\r", "/bad\r"]) {
    stdin.emit(line);
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  }
  const text = session.screen().rows.join("\n");
  if (process.env["DEBUG_ROWS"]) console.log(text);
  await session.tui.stop("exit");
  return text;
};

describe("C22 I153 — a session at the ASCII rung", () => {
  it("C22 T4.123 (I153, F1483): at LANG=C the screen holds no PROSE_MARKS character, and at UTF-8 the em dash is drawn", async () => {
    const ascii = await screenAt("C");
    // **The control comes first**: the same session at UTF-8 draws the
    // producer's dash, so the fixture carries the marks the ASCII screen must
    // not, and a screen that drew nothing could not pass.
    const utf8 = await screenAt("en_GB.UTF-8");
    expect(utf8, "the producer's em dash is drawn at UTF-8").toContain("—");
    expect(utf8, "so is the framework's own, in the refusal").toContain("(C04 I6, D29) — colour alone");
    expect(ascii, "the producer's notice is drawn at the ASCII rung").toContain("disk full - retry - later");
    expect(ascii, "and so is the refusal").toContain("(C04 I6, D29) - colour alone");
    expect(MARKS.filter((m) => ascii.includes(m)), "no prose mark reaches the ASCII screen").toEqual([]);
  });
});
