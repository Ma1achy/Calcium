/**
 * C26 §7 in a session — the frame, not the store (F802).
 *
 * Every row about a focused plot's frame rendered through `renderToLines` with
 * a hand-built `FocusState`, and for three weeks the state a session writes was
 * a different one; T1.25 was green while `↓` onto a plot lit nothing. This row
 * takes the long way round: a real session, the key, the bytes on the screen.
 */
import { describe, expect, it } from "vitest";
import { buildSession } from "../support/session.js";
import { fakeStdin, capabilities } from "../support/fake-terminal.js";
import { rowContaining, styleAt, styledScreenFrom } from "../support/styled-screen.js";
import { tone } from "../../src/presentation/blocks/paint.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { sgr } from "../../src/terminal/escapes.js";

const DOWN = "\u001b[B";
const params = (style: ReturnType<typeof tone>): string => sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");

describe("C26 §7 — a focused plot's frame, read from a session's screen", () => {
  it("T4.30 (C26 I21, §7; C12 I85; F802): `↓` from the prompt onto a plot turns its lid accent — muted before, accent after, the label column untouched", async () => {
    const stdin = fakeStdin();
    const size = { columns: 80, rows: 24 };
    const s = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "plot", local: true, summary: "a plot", args: [], flags: [] }],
        },
        localHandlers: {
          plot: () => ({
            schema: "tui.view/1",
            status: "ok",
            blocks: [{ kind: "plot", id: "p", form: "line", height: 5, axes: true, camera: {}, series: [{ label: "train", values: [10, 20, 30, 40, 50] }] }],
          }),
        },
      } as never,
      size,
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };
    await type("/plot\r");
    await Promise.resolve();

    const loaded = loadTheme(defaultTheme, "dark");
    if (!loaded.ok) throw new Error("the default theme did not load");
    const theme = loaded.value.current;
    // **The session renders at 8-bit** — its detected capabilities, not the
    // 24-bit fixture default — so the tones are resolved at the depth the frame
    // is actually painted in (`38;5;NNN`), read off the unfocused lid below
    // before either is asserted.
    const caps = capabilities({ colourDepth: 8 });
    const accent = params(tone("accent", theme, caps));
    const muted = params(tone("muted", theme, caps));
    const screen = () => styledScreenFrom(s.stdout.chunks, size);
    const lid = () => rowContaining(screen(), "┐");
    expect(lid(), "the plot's lid is on screen").not.toBeNull();
    // **The fixture responds before it is asserted against**: the lid is muted with focus at the prompt.
    expect(styleAt(lid()!, "─")!.fg, "unfocused: the lid is muted").toBe(muted);

    await type(DOWN);
    expect(styleAt(lid()!, "─")!.fg, "focused from the keyboard: the lid is accent").toBe(accent);
    expect(styleAt(lid()!, "┐")!.fg, "and its corner with it").toBe(accent);
    const labelRow = rowContaining(screen(), "┤");
    expect(labelRow, "an area row with a y-label").not.toBeNull();
    expect(styleAt(labelRow!, "┤")!.fg, "the side rule is accent").toBe(accent);
  });
});
