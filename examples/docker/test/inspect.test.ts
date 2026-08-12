/**
 * S5 `/inspect <c>` and `--raw`. Every test names the walk row it holds.
 *
 * The corpus is **real daemon output** — `docker inspect` on an `nginx:alpine`
 * container with a port binding, an env override and a mount, plus the
 * devcontainer's own 245-line record, which is the one that overflows.
 *
 * **What these rows cannot see**: they drive the adapter directly, not a shell.
 * That the split reaches the screen at all is the frame-read's job — a suite of
 * only these rows passes on the day nothing calls them.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdapterContext } from "@fmx/calcium";
// F37: no public measurer. Resolved through the package — see `deep.ts`.
import type { Block, Code, KeyValue, Notice } from "@fmx/calcium";
import { SPLIT_FLOOR, createInspectAdapter, splitRaw, structuredBlocks } from "../src/inspect.ts";

/**
 * The measurer the app is handed at runtime, from the framework's own testing
 * entry (C24 I26) — not a reimplementation, which is the whole of F37 closing.
 */
const measure = producerContext().measure;
const codeRows = (text: string, width: number): number =>
  measure({ kind: "code", id: "m", language: "json", text, wrap: true } as Code, width);
import type { Row } from "../src/ndjson.ts";

import { producerContext } from "@fmx/calcium/testing";
const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const CONTAINER = JSON.parse(read("inspect-container-real.json")) as Row;
/** The 245-line record — the document the ceiling was found on. */
const BIG = (JSON.parse(read("inspect-raw-probe.json")) as Row[])[0] as Row;


const result = (over: Partial<Record<string, unknown>> = {}): never =>
  ({
    exitCode: 0,
    stdoutRaw: "",
    stderr: "",
    argv: ["docker", "inspect", "x"],
    durationMs: 1,
    ...over,
  }) as never;

/**
 * **Typed, not `as never`.** The cast is why the `flags` field arrived as three
 * runtime failures rather than one compile error: `as never` satisfies any
 * parameter, so the fixture stopped tracking the type it stands for. Fourth
 * instance of the same cast hiding the same class.
 */
const ctxWith = (flags: Readonly<Record<string, unknown>> = {}): AdapterContext => ({
  ...producerContext(),
  command: "/inspect x",
  verb: "inspect",
  transport: "subprocess",
  origin: "user",
  width: 120,
  userRequestedJson: false,
  flags,
  tool: null,
});

const ctx = ctxWith();

// ── The arithmetic the app no longer writes ────────────────────────────────
//
// **The `codeRows` block is gone, and its deletion is F37 closing.** Three rows
// lived here: that the app's row count equals the registry's at three widths,
// that a long line wraps, and that a wide character is two cells. All three
// existed to pin a reimplementation of the measurer against the real one,
// through a deep import into `dist/` — the workaround `CLAUDE.md` forbids by
// name, kept honest by a pin rather than trusted.
//
// `ProducerContext.measure` is the frame's own measurer now. There is no second
// arithmetic, so there is nothing to pin and no drift to catch: the rows did not
// become unnecessary, their subject did. `test/deep.ts` went with them, and with
// it the app's last reach past the package boundary.

describe("splitRaw", () => {
  it("I3 (walk B1): the whole document is one block, and that block cannot be scrolled", () => {
    // **The fixture is shown to be the trap.** 245 rows against any real region
    // is the case the split exists for; without this the rows below pass
    // against a document that never needed splitting.
    const whole = `"x": ${JSON.stringify(BIG, null, 2)}`;
    expect(codeRows(whole, 120), "the subject overflows every region").toBeGreaterThan(200);
  });

  it("I4 (walk B1): nothing exceeds the floor except what cannot be divided", () => {
    const blocks = splitRaw(BIG, 120, measure);
    const over = blocks.filter((bl) => codeRows((bl as Code).text, 120) > SPLIT_FLOOR);

    // The residue is walk B2's floor: a leaf with no children, or the depth cap.
    // It is not zero and the ruling says so — I47's indicator carries it.
    for (const bl of over) {
      const text = (bl as Code).text;
      const value = JSON.parse(text.slice(text.indexOf(": ") + 2)) as unknown;
      const children =
        value !== null && typeof value === "object" ? Object.keys(value as object).length : 0;
      expect(
        children === 0 || bl.id.split(".").length > 3,
        `${bl.id} is over the floor and could still have been divided`,
      ).toBe(true);
    }
    expect(blocks.length, "and it did split, rather than emitting one block").toBeGreaterThan(50);
  });

  it("I5 (walk B3): --raw wraps, because its promise is the bytes", () => {
    // `b.code` defaults to `wrap: false`, which cuts at the width — seven lines
    // of a real inspect exceed 120 columns and the longest is 2862 characters.
    expect(splitRaw(BIG, 120, measure).every((bl) => (bl as Code).wrap)).toBe(true);
  });

  it("I6 (walk B5): a key whose value is empty is a row, not an omission", () => {
    // `--raw` transcribes, where `/drift`'s map omits a field neither side has.
    // The two verbs disagree, and the reason is the difference between a map
    // and a transcription.
    const blocks = splitRaw({ ExecIDs: null, Args: [], Id: "abc" }, 120, measure);
    expect(blocks.map((bl) => bl.id)).toEqual(["raw-ExecIDs", "raw-Args", "raw-Id"]);
  });

  it("I7: a smaller floor splits further, so the floor is the thing doing the work", () => {
    // Mutation bait made a row: a split that ignored its floor would return the
    // same blocks for both.
    expect(splitRaw(BIG, 120, measure, 8).length).toBeGreaterThan(splitRaw(BIG, 120, measure, 40).length);
  });
});

// ── The two modes, and the failure arms ─────────────────────────────────────

describe("the adapter", () => {
  it("I8 (F39): --raw is read from ctx.flags, and its absence is the structured mode", () => {
    // **It was `result.argv`, and that was the defect.** Every declared flag
    // was transmitted, so the flag reaching the adapter was the same token that
    // reached docker — which exited 125. `shellOnly` removes it from argv by
    // construction (C05 I21), so reading argv here would now always be false
    // and the raw mode would be unreachable from the shell.
    //
    // The argv below is deliberately *without* `--raw`, because that is what
    // the transport now receives: if the read regressed to argv, this fails.
    const raw = createInspectAdapter().adapt(
      result({ stdoutRaw: JSON.stringify([BIG]), argv: ["docker", "inspect", "x"] }),
      ctxWith({ raw: true }),
    );
    expect(raw.blocks.every((bl: Block) => bl.kind === "code")).toBe(true);
    expect(raw.blocks.length).toBeGreaterThan(50);

    const structured = createInspectAdapter().adapt(
      result({ stdoutRaw: JSON.stringify([BIG]) }),
      ctx,
    );
    expect(structured.blocks).toHaveLength(1);
    expect(structured.blocks[0]?.kind).toBe("keyValue");
  });

  it("I9 (S5): the structured mode carries the drawing's rows", () => {
    const kv = structuredBlocks(CONTAINER)[0] as KeyValue;
    const labels = kv.rows.map((r) => r.label);
    for (const wanted of ["Id", "Name", "State", "Image", "Ports", "Mounts", "Network", "Env"]) {
      expect(labels).toContain(wanted);
    }
    // The port row is the one `/drift` got wrong first: a binding, not the
    // declaration, when there is one.
    expect(kv.rows.find((r) => r.label === "Ports")?.value).toContain("8080");
  });

  it("I10: an exposed but unpublished port says so, rather than saying nothing", () => {
    const kv = structuredBlocks({
      Config: { ExposedPorts: { "80/tcp": {} } },
      HostConfig: { PortBindings: {} },
    } as unknown as Row)[0] as KeyValue;
    expect(kv.rows.find((r) => r.label === "Ports")?.value).toContain("exposed");
  });

  it("I11 (F35): docker exiting non-zero is an error document with its error set", () => {
    const doc = createInspectAdapter().adapt(
      result({ exitCode: 1, stderr: "No such object: nope" }),
      ctx,
    );
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("No such object");
    expect((doc.blocks[0] as Notice).text).toContain("No such object");
  });

  it("I12: exit zero with nothing readable is also a failure, which the code alone misses", () => {
    // `docker inspect` on a name it half resolves exits 0 with `[]`, and an
    // empty view would say the container has no properties rather than that it
    // was not found.
    for (const stdoutRaw of ["[]", "", "not json at all"]) {
      const doc = createInspectAdapter().adapt(result({ stdoutRaw }), ctx);
      expect(doc.status, `for ${JSON.stringify(stdoutRaw)}`).toBe("error");
      expect(doc.error, "C04 I3 — and its absence is silent").toBeDefined();
    }
  });
});
