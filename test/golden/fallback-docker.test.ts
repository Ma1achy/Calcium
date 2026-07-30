// C07 §5 — the fallback, against the far side it claims to absorb.
//
// R01 §4 records docker's real JSON and calls it awkward on purpose:
// capitalised keys, `Names` plural but usually singular, `Status` as prose
// while `State` is the machine-readable one, `Ports` a formatted string, and
// everything a string including the numbers. An adapter is what makes that
// pretty. **This file asserts what it looks like with no adapter at all.**
//
// That is C07's central claim under test rather than under discussion:
// commitment 3 says the fallback renders any JSON legibly, and I11 says no
// adapter is required for a verb to be usable. Both are statements about how
// this snapshot reads. If a reviewer looks at it and cannot tell which
// container is running, the claim is false and the §5 shape table is what
// changes — not this test.
//
// A snapshot rather than assertions, for the reason test/golden/README gives:
// what it protects is appearance, which no invariant states and every reader
// notices.
import { describe, expect, it } from "vitest";
import { createFallbackAdapter } from "../../src/data/adapters/fallback.js";
import type { AdapterContext, RawResult } from "../../src/data/adapters/types.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";
import { planColumns, tableDefinition } from "../../src/presentation/table/index.js";

/** R01 §4, verbatim — the fields and the awkwardness, not a tidied version. */
const DOCKER_PS: readonly Record<string, string>[] = [
  {
    ID: "a3f9b21c8d2e",
    Names: "web",
    Image: "nginx:1.25",
    State: "running",
    Status: "Up 3 hours",
    Ports: "0.0.0.0:8080->80/tcp",
    CreatedAt: "2026-07-28 09:14:02 +0000",
  },
  {
    ID: "7c1d4e8a0b93",
    Names: "api,api-legacy",
    Image: "ghcr.io/acme/api:2.4.1",
    State: "running",
    Status: "Up 12 minutes (healthy)",
    Ports: "0.0.0.0:3000->3000/tcp",
    CreatedAt: "2026-07-29 08:02:44 +0000",
  },
  {
    ID: "0f5b6c2d19ae",
    Names: "worker",
    Image: "ghcr.io/acme/worker:2.4.1",
    State: "exited",
    Status: "Exited (0) 2 days ago",
    Ports: "",
    CreatedAt: "2026-07-27 17:30:11 +0000",
  },
];

const CTX: AdapterContext = Object.freeze({
  command: "/ps",
  verb: "ps",
  width: 120,
  userRequestedJson: false,
  transport: "subprocess",
  origin: "user",
  tool: null,
});

function resultOf(stdout: unknown): RawResult {
  return Object.freeze({
    argv: ["docker", "ps", "--format", "json"],
    exitCode: 0,
    signal: null,
    stdout,
    stdoutRaw: JSON.stringify(stdout),
    stderr: "",
    durationMs: 41,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
  });
}

describe("C07 §5 — docker's real JSON through the fallback, unadapted", () => {
  const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS });

  it("a single container object — the drill-down shape", () => {
    // `/inspect` returns one object, not a list. Same fallback, different §5 row,
    // and the one whose renderer exists today.
    const doc = createFallbackAdapter().adapt(resultOf(DOCKER_PS[0]), CTX);
    expect(validateDocument(doc).ok).toBe(true);

    const frame = doc.blocks.map((b) => kit.renderToLines(b, 80).join("\n")).join("\n");
    expect(frame).toMatchSnapshot();
  });

  // The list shape's *structure*, which is assertable now, separately from its
  // appearance, which is not. What a reviewer needs to see — that `ID` leads,
  // that `Status` prose and `State` both survive as columns, that nothing was
  // flattened or invented — is here; how wide the columns come out is C11's.
  it("the list shape carries docker's own fields, in docker's own order", () => {
    const doc = createFallbackAdapter().adapt(resultOf(DOCKER_PS), CTX);
    expect(validateDocument(doc).ok).toBe(true);

    const table = doc.blocks.find((b) => b.kind === "table");
    if (table?.kind !== "table") throw new Error("the list shape did not produce a table");

    // The marker leads and names no field (§5); the fields follow, in docker's order.
    expect(table.columns[0]?.role).toBe("expand");
    expect(table.columns.filter((c) => c.role === undefined).map((c) => c.key)).toEqual([
      "ID",
      "Names",
      "Image",
      "State",
      "Status",
      "Ports",
      "CreatedAt",
    ]);
    // `Status` is prose and `State` is machine-readable (R01 §4). The fallback
    // shows both and reads neither, which is the only honest thing it can do —
    // deriving a glyph from `Status` is the mistake R01 names, and it is a
    // mistake the fallback cannot make because it never interprets.
    expect(table.rows[2]?.cells["Status"]?.text).toBe("Exited (0) 2 days ago");
    expect(table.rows[2]?.cells["State"]?.text).toBe("exited");
    // `Names` comma-joined stays verbatim. Splitting it is the adapter's job
    // (R01 R1.3) and guessing at it here would be inventing structure.
    expect(table.rows[1]?.cells["Names"]?.text).toBe("api,api-legacy");
  });

  // **C07 §5 carries this as an open risk, not as work waiting on C11.**
  //
  // `table` registers from C11 (C09 §2 renders an unregistered kind as `raw`),
  // so a snapshot today captures a JSON blob and reads to a later reviewer as
  // reviewed. But the claim under test is C07's: commitment 3 and I11 say a
  // verb shipping tomorrow is usable tomorrow, a list is the majority shape,
  // and that claim is unproven for exactly that shape. If the rendered output
  // is not legible, **the §5 shape table changes** — the caps, the decision not
  // to split `Names`, the nested-object-as-JSON rule — and C11 is unaffected.
  //
  // Reading this output is a named step in C11's plan. The todo expiring is how
  // the deferral is enforced, not how the risk is discharged.
  it("the list shape rendered at 80, 120 and 160 with no adapter", () => {
    // Read on the commit that registered `table`, and it failed the reading: under a
    // uniform `minWidth: 3` the seven columns rendered in 33 cells at every width,
    // `State` and `Status` both headed `St…`, and — the part that mattered — nothing
    // ever dropped, so no row was ever expandable and D38's guarantee held only
    // because nothing was shed.
    //
    // §5 now measures each column's `minWidth` from its own widest value, capped at
    // 24. This snapshot is what that produces, and it is the artefact the risk was
    // recorded against.
    const doc = createFallbackAdapter().adapt(resultOf(DOCKER_PS), CTX);
    const table = doc.blocks.find((b) => b.kind === "table");
    if (table?.kind !== "table") throw new Error("the list shape did not produce a table");

    // Measured, not defaulted: `Names` asks for 14 (`api,api-legacy`) and `State`
    // for 7 (its own header, longer than `running`). Nothing is at the old floor of
    // 3 except by coincidence of content, and nothing exceeds the cap.
    const asked = new Map(table.columns.map((c) => [c.key, c.minWidth]));
    expect(asked.get("Names")).toBe(14);
    // The marker asks for one cell and is outside the field cap.
    expect(table.columns[0]?.minWidth).toBe(1);
    expect(table.columns).toHaveLength(8);
    expect(asked.get("State")).toBe(7);
    expect(asked.get("Status")).toBe(23);
    expect(
      table.columns.filter((c) => c.role === undefined).every((c) => c.minWidth >= 3 && c.minWidth <= 24),
    ).toBe(true);

    // **D38's mechanism is live.** At 80 the total exceeds the terminal, so columns
    // drop by priority — last-appearing first — and every dropped field reaches the
    // expand row, which is what makes every row expandable.
    expect(planColumns(table.columns, 80).dropped).toEqual(["Status", "Ports", "CreatedAt"]);
    expect(planColumns(table.columns, 160).dropped).toEqual([]);
    // Still no `flex`, so at 160 the table is its own width rather than the
    // terminal's — correct, because every column already has what it asked for.
    expect(table.columns.some((c) => c.flex === true)).toBe(false);

    const registered = measurable({
      definitions: [tableDefinition],
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
    });

    const frame = [80, 120, 160]
      .map((width) =>
        [
          `── unadapted · ${String(width)} cells`,
          ...doc.blocks.flatMap((b) => registered.renderToLines(b, width)),
        ].join("\n"),
      )
      .join("\n");

    expect(frame).toMatchSnapshot();
  });
});
