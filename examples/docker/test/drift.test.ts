/**
 * S7 `/drift` and S6 `/compare`. Every test names the walk row it holds.
 *
 * The corpus is **real daemon output** — `docker inspect dtui-web` and
 * `docker image inspect nginx:alpine`, an `nginx:alpine` container run with
 * `-p 8080:80 -e LOG_LEVEL=info -v /tmp:/data`. Every field kind and both tally
 * arms are in that one pair, which is why it was chosen; a hand-written fixture
 * would encode the same assumptions the drawing did, and it was the drawing that
 * was wrong (F4, F11).
 *
 * **What these rows cannot see**: they drive the map and the handlers directly,
 * not a shell. That `/drift` is reachable as a verb at all is the seal test's
 * job and the frame-read's — a suite of only these rows passes on the day
 * nothing calls them.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Block, Comparison, ComparisonRow, KeyValue, Notice } from "@fmx/calcium";
import {
  FIELDS,
  compareRows,
  createCompareHandler,
  createDriftHandler,
  driftRows,
  rowsFor,
} from "../src/drift.ts";
import type { Row } from "../src/ndjson.ts";

const read = (name: string): Row =>
  JSON.parse(readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8")) as Row;

const CONTAINER = read("inspect-container-real.json");
const IMAGE = read("inspect-image-real.json");
/** The same image run with no `-p`, no `-e`, no `-v` — frame-read 2's subject. */
const PLAIN = read("inspect-container-plain.json");

const cfg = (i: Row): Row => i["Config"] as Row;
const find = (rows: readonly ComparisonRow[], field: string): ComparisonRow | undefined =>
  rows.find((r) => r.field === field);

// ── The map ─────────────────────────────────────────────────────────────────

describe("the field map", () => {
  it("N1 (walk B1): null and empty string both mean absent, so an unset user is not drift", () => {
    // **The fixture is shown to contain the trap before anything is asserted
    // against it.** Without these three lines the row below passes against a map
    // that never normalises, because it only ever asserts an absence.
    //
    // **Absent, not null** — and the walk's first write-up of this row said
    // `null`, because `dict.get()` collapses the two and the evidence was read
    // through it. Asserted on the key set, which cannot.
    expect(Object.hasOwn(cfg(IMAGE), "User"), "the image has no User key at all").toBe(false);
    expect(cfg(CONTAINER)["User"], "and the daemon fills it as an empty string").toBe("");
    // The naive comparison the map exists to avoid — the control.
    expect(cfg(IMAGE)["User"] === cfg(CONTAINER)["User"], "a === comparison disagrees").toBe(
      false,
    );

    // Both normalise to absent, so walk B5 omits the row entirely rather than
    // reporting drift on a container that has drifted in no way.
    const rows = driftRows(IMAGE, CONTAINER);
    expect(rows.map((r) => r.field)).not.toContain("user");
    expect(rows.filter((r) => r.comparison === "changed").map((r) => r.field)).not.toContain(
      "user",
    );
  });

  it("N2 (walk B3): ports reads two different paths, and a same-path read sees nothing", () => {
    // The container inherits `ExposedPorts` **identically**, so a `Config`-only
    // comparison reports no drift on the row the surface leads with. This is why
    // `ports` has a different reader per side.
    expect(cfg(CONTAINER)["ExposedPorts"], "inherited unchanged").toEqual(
      cfg(IMAGE)["ExposedPorts"],
    );

    const row = find(driftRows(IMAGE, CONTAINER), "ports 80/tcp");
    expect(row?.a, "the image declares the port").toBe("exposed");
    expect(row?.b, "the container publishes it").toContain("8080");
    expect(row?.comparison).toBe("changed");
  });

  it("N3 (walk B5): a field neither side has is omitted, and the tally does not count it", () => {
    const only: Row = { Config: { Env: ["A=1"] } };
    const rows = driftRows(only, only);

    // `stop signal`, `workdir`, `cmd`, `entrypoint`, `user` are on neither side.
    for (const absent of ["stop signal", "workdir", "cmd", "entrypoint", "user"]) {
      expect(rows.map((r) => r.field), `${absent} has no subject`).not.toContain(absent);
    }
    // `N identical` has to mean N things that agree, or the number the
    // empty-drift frame rests on is inflated by fields nobody has.
    expect(find(rows, "env")?.a).toBe("1 identical");
  });

  it("N4 (walk B4): a keyed field renders the keys that differ, plus one tally", () => {
    const rows = driftRows(IMAGE, CONTAINER);
    const envRows = rows.filter((r) => String(r.field).startsWith("env"));

    // Measured on this pair: one variable differs, seven agree.
    expect(envRows.filter((r) => r.comparison === "changed")).toHaveLength(1);
    expect(find(rows, "env LOG_LEVEL")?.b).toBe("info");
    expect(find(rows, "env")?.a).toBe("7 identical");
    // The whole point of the ruling: the one that moved is not buried.
    expect(envRows).toHaveLength(2);
  });

  it("N5 (walk B2): a one-sided key is `changed` with an em dash, never a verdict in the label", () => {
    // `Comparison`'s union has no `added`/`removed`, so absence lives in the
    // data. Encoding it in the field label would put a verdict in the column
    // that names the field, where it sorts and truncates as part of the name.
    const row = find(driftRows(IMAGE, CONTAINER), "mounts /data");
    expect(row?.a, "absent side is an em dash").toBe("—");
    expect(row?.b).toContain("/tmp");
    expect(row?.comparison).toBe("changed");
    for (const r of driftRows(IMAGE, CONTAINER)) {
      expect(String(r.field), "no verdict rides in a field label").not.toMatch(
        /added|removed|changed/u,
      );
    }
  });

  it("N6 (walk B6): the twelve daemon-filled keys are not in the map", () => {
    // Not because they are always different — because they are not drift. A
    // surface reporting them would be correct on every row and useful on none.
    const labels = FIELDS.map((f) => f.label);
    for (const daemon of ["hostname", "domainname", "tty", "stdinonce", "stoptimeout"]) {
      expect(labels).not.toContain(daemon);
    }
    expect(FIELDS).toHaveLength(9);
  });

  it("N7: an undrifted container produces rows, not an empty block", () => {
    // **Frame-read 2's subject, and writing it found a design error.** The first
    // version compared the container against itself, which is not the identical
    // case — `ports` reads a declaration on one side and a binding on the other,
    // so it can never agree. The real subject is a container run with no `-p`,
    // no `-e` and no `-v`.
    //
    // Asserted here so the frame is a confirmation rather than the only
    // evidence: nothing differs, and the block still says so, because an empty
    // comparison reads exactly like a lookup that failed.
    const rows = driftRows(IMAGE, PLAIN);
    expect(rows.length, "an undrifted container still fills the block").toBeGreaterThan(0);
    expect(rows.filter((r) => r.comparison !== "same"), "and nothing reads as drift").toEqual([]);
    // Every tally arm is exercised by this one container.
    expect(rows.map((r) => r.a)).toContain("7 identical");
    expect(rows.map((r) => r.field)).toContain("ports");
  });
});

// ── The handlers ────────────────────────────────────────────────────────────

describe("the verbs", () => {
  it("N8 (walk A1): a missing image keeps the block and empties the column", async () => {
    // **S3's `renderError` lesson pointed at a two-source block.** The
    // container's own facts are still perfectly good, so the thing that reports
    // the absence must not replace the thing that would have explained it.
    const rows = driftRows(null, CONTAINER);

    expect(rows.length, "the container's facts survive").toBeGreaterThan(0);
    expect(rows.every((r) => r.a === "—"), "every image cell is absent").toBe(true);
    expect(find(rows, "cmd")?.b, "and the container's are intact").toContain("nginx");
  });

  it("N8b (walk A1): through the handler, a failed image lookup keeps the block", async () => {
    // **N8 covers the mechanism and this covers the wiring.** Replacing the
    // handler's branch with an error document killed nothing until this row
    // existed — the third instance of that recurrence in this project.
    //
    // Driven through an injected lookup because the state is **not inducible**:
    // docker refuses to remove an image a running container references
    // (`cannot be forced`), so walk A1's trigger is a daemon that fails the
    // second call rather than an image that is gone.
    const handler = createDriftHandler((kind) =>
      Promise.resolve(kind === "container" ? CONTAINER : null),
    );
    const doc = await handler(["dtui-web"], { command: "/drift dtui-web" });

    expect(doc.status, "the container's facts are still worth showing").toBe("ok");
    const cmp = doc.blocks.find((bl: Block) => bl.kind === "comparison") as Comparison;
    expect(cmp, "the block survives the missing side").toBeDefined();
    expect(cmp.rows.every((r) => r.a === "—"), "every image cell is empty").toBe(true);
    // And the reader is told why, beside the block rather than instead of it.
    const notice = doc.blocks.find((bl: Block) => bl.kind === "notice") as Notice;
    expect(notice?.text).toContain("image is unavailable");
  });

  it("N9: /drift reports a container it cannot find, and does not render an empty comparison", async () => {
    const doc = await createDriftHandler()(["no-such-container-xyz"], {
      command: "/drift no-such-container-xyz",
    });
    expect(doc.status).toBe("error");
    expect(doc.blocks.some((bl: Block) => bl.kind === "comparison")).toBe(false);
    expect((doc.blocks[0] as Notice).text).toContain("no such container");
  });

  it("N10: /drift against the live fixture names the image it compared with", async () => {
    // Through the **handler**, so the two calls and the id-to-tag resolution are
    // covered rather than the map alone.
    const doc = await createDriftHandler()(["dtui-web"], { command: "/drift dtui-web" });
    if (doc.status !== "ok") return; // the fixture is not running; N9 still holds
    // **Not asserted as a tag.** The first version expected `nginx`, and an
    // untagged image — which `docker rmi -f` produces, and which a re-pull
    // produces in the wild — made it fail. What the row must do is *identify*
    // the image; whether it does so by tag or by id is the daemon's business.
    const head = doc.blocks.find((bl: Block) => bl.id === "drift-head") as KeyValue;
    const image = head.rows.find((r) => r.label === "IMAGE")?.value ?? "";
    expect(image, "the head names the image it compared against").not.toBe("");
    expect(image, "by tag, or by the id it falls back to").toMatch(/nginx|^[0-9a-f]{12}$/u);
    const cmp = doc.blocks.find((bl: Block) => bl.kind === "comparison") as Comparison;
    expect(cmp.rows.some((r) => r.field === "ports 80/tcp")).toBe(true);
  });

  it("N11: /compare uses the container reader on both sides", async () => {
    // The `ports` two-reader case collapses, which is the whole of why
    // `/compare` is cheap once the map exists: both sides read
    // `HostConfig.PortBindings`, so an identical pair shows no port drift.
    const rows = compareRows(CONTAINER, CONTAINER);
    expect(rows.every((r) => r.comparison === "same")).toBe(true);

    const drifted = driftRows(IMAGE, CONTAINER);
    expect(find(drifted, "ports 80/tcp")?.comparison, "where /drift does see it").toBe("changed");
  });

  it("N12: /compare refuses a missing container by name", async () => {
    const doc = await createCompareHandler()(["dtui-web", "no-such-xyz"], {
      command: "/compare dtui-web no-such-xyz",
    });
    expect(doc.status).toBe("error");
    expect((doc.blocks[0] as Notice).text).toContain("no-such-xyz");
  });
});

// ── The shape of a row ──────────────────────────────────────────────────────

describe("rowsFor", () => {
  it("N13: a scalar always renders, so an unchanged entrypoint is still a fact on screen", () => {
    const field = FIELDS.find((f) => f.label === "entrypoint");
    const rows = rowsFor(field as never, IMAGE, CONTAINER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.comparison).toBe("same");
  });
});
