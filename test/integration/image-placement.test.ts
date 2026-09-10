/**
 * C09 I66 through a real session — the two halves that land together.
 *
 * **The seam takes the scope from its group and the renderer takes it from
 * `RenderContext`, and a session is the only place both are supplied.** Half of
 * that pair draws nothing: a scoped seam against an unscoped frame places an
 * image nobody transmitted, and the converse transmits at an id nothing
 * addresses. Neither half fails a unit row, because a unit row supplies both
 * itself. So the control here is the half-landed pair, constructed by hand.
 */
import { describe, expect, it } from "vitest";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { b } from "../../src/shell/builders/index.js";
import { PLACEHOLDER, placementIdOf } from "../../src/presentation/image/kitty.js";
import { rgbPng64 } from "../support/png.js";
import type { Image, ViewDocument } from "../../src/data/viewmodel/index.js";

const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};

const png = rgbPng64(16, 16, (x) => [x < 8 ? 200 : 30, 90, 128]);

const picture = (): Image => b.image({ id: "shot", data: png, height: 4, alt: "a shot" }) as Image;

const greetingOf = (blocks: ViewDocument["blocks"]): ViewDocument => ({
  schema: "tui.view/1",
  command: "/shot",
  status: "ok",
  blocks,
  // All ten fields: six is a document C04 refuses, and the refusal is swallowed
  // on the way out, so a session starts and shows nothing (F135).
  meta: {
    verb: "shot",
    adapter: "shot",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: ["shot"],
    stderr: "",
    transport: "local",
    origin: "refresh",
  },
});

describe("C09 §4c — the seam and the frame carry one placement id (I66)", () => {
  it("T4.58 (I66, C22 I71): the `a=T` a session writes is addressed by the placeholders in the frame that follows", async () => {
    const s = await buildSession(
      {
        stdin: fakeStdin() as never,
        capabilities: { imageProtocol: "kitty" },
        greeting: () => greetingOf([picture()]),
      },
      { columns: 60, rows: 24 },
    );
    await settle();
    const written = s.stdout.chunks.join("");
    await s.tui.stop("exit");

    // **The fixture responds before anything is read from it.** A session that
    // never took the protocol arm would satisfy every negative claim below.
    expect(written, "the protocol arm ran at all").toContain("a=T");
    expect(written, "and the frame carries placeholders").toContain(PLACEHOLDER);

    const transmitted = [...written.matchAll(/i=(\d+)/g)].map((m) => Number(m[1]));
    const placed = [
      ...written.matchAll(new RegExp(`\\u001b\\[38;2;(\\d+);(\\d+);(\\d+)m${PLACEHOLDER}`, "gu")),
    ].map((m) => (Number(m[1]) << 16) + (Number(m[2]) << 8) + Number(m[3]));

    expect(new Set(transmitted).size, "one picture, one placement").toBe(1);
    expect(placed.length, "the grid was painted").toBeGreaterThan(1);
    expect(
      new Set(placed),
      "and every placeholder addresses the id that was sent",
    ).toEqual(new Set(transmitted));

    // **The control: the half-landed pair.** The seam scoped by the entry and
    // the renderer given nothing is exactly what the tree looked like between
    // the two commits, and it is the state that draws nothing. Constructed
    // rather than asserted about, because no session can be in it.
    const block = picture();
    const scoped = placementIdOf(block, "entry-1");
    const unscoped = placementIdOf(block);
    expect(scoped, "the two halves disagree, which is why they land together").not.toBe(unscoped);
  });
});
