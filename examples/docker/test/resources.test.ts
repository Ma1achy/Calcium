/**
 * The resource tail — every field name asserted against a line copied out of a
 * real invocation.
 *
 * **The fixtures below are docker's actual output, not a shape written from the
 * documentation.** That matters more here than anywhere else in this app: the
 * keys are capitalised, they differ per verb, and a wrong guess compiles and
 * renders an empty cell. `volume ls` has no `ID` at all; `builder ls` reports a
 * zero timestamp for "never"; `context ls` is one of the few places docker emits
 * a real boolean rather than the string `"true"`.
 */

import { describe, expect, it } from "vitest";
import { createListAdapter, createResourceInspectAdapter } from "../src/resources.ts";
import type { AdapterContext, Block, RawResult } from "@fmx/calcium";

const raw = (stdoutRaw: string, exitCode = 0, stderr = ""): RawResult =>
  ({
    argv: ["docker"],
    stdout: undefined,
    stdoutRaw,
    stderr,
    exitCode,
    signal: null,
    durationMs: 3,
    cancelled: false,
    timedOut: false,
    parseError: null,
  }) as unknown as RawResult;

const ctx = (verb: string): AdapterContext =>
  ({
    command: `/${verb}`,
    verb,
    transport: "subprocess",
    origin: "user",
    width: 100,
  }) as unknown as AdapterContext;

/** Measured lines, one per verb. */
const FIXTURES: Readonly<Record<string, string>> = {
  "network ls":
    '{"CreatedAt":"2026-07-28 20:35:42 +0000 UTC","Driver":"bridge","ID":"6df1bcae5ccc","IPv4":"true","IPv6":"false","Internal":"false","Labels":"","Name":"bridge","Scope":"local"}',
  "volume ls":
    '{"Availability":"N/A","Driver":"local","Group":"N/A","Labels":"","Links":"N/A","Mountpoint":"/var/lib/docker/volumes/vscode/_data","Name":"vscode","Scope":"local","Size":"N/A","Status":"N/A"}',
  "context ls":
    '{"Current":true,"Description":"Docker Desktop","DockerEndpoint":"unix:///var/run/docker.sock","Error":"","Name":"desktop-linux"}',
  "builder ls":
    '{"Current":false,"Driver":"docker","Dynamic":false,"LastActivity":"0001-01-01T00:00:00Z","Name":"default"}',
  "system df":
    '{"Active":"8","Reclaimable":"5.973GB (16%)","Size":"37.32GB","TotalCount":"15","Type":"Images"}',
  "image history":
    '{"Comment":"","CreatedAt":"2026-01-01","CreatedBy":"CMD [\\"sh\\"]","CreatedSince":"5 weeks ago","ID":"abc","Size":"0B"}',
};

const textOf = (blocks: readonly Block[]): string => JSON.stringify(blocks);

describe("the resource tail — measured field names", () => {
  it("T1: every list verb renders its own line without an empty cell", () => {
    for (const [verb, line] of Object.entries(FIXTURES)) {
      const doc = createListAdapter(verb).adapt(raw(line), ctx(verb));
      expect(doc.status, verb).toBe("ok");

      const table = JSON.parse(textOf(doc.blocks))[0] as {
        kind: string;
        rows: { cells: Record<string, { text: string }> }[];
      };
      expect(table.kind, `${verb} renders a table`).toBe("table");
      const cells = table.rows[0]!.cells;
      // **The assertion that catches a guessed key.** A wrong capitalisation
      // yields `""` from `str`, which renders and looks like a narrow column.
      for (const [key, cell] of Object.entries(cells)) {
        if (key === "current") continue; // deliberately a space when not current
        expect(cell.text, `${verb}.${key} must not be empty`).not.toBe("");
      }
    }
  });

  it("T2 (Frame 8): an empty result is a notice, never a table with no rows", () => {
    for (const verb of Object.keys(FIXTURES)) {
      const doc = createListAdapter(verb).adapt(raw(""), ctx(verb));
      expect(doc.status).toBe("ok");
      const kinds = JSON.parse(textOf(doc.blocks)).map((b: { kind: string }) => b.kind);
      // A header with no rows reads as a rendering that failed; a sentence
      // reads as an answer.
      expect(kinds, `${verb} on empty`).toEqual(["notice"]);
      expect(kinds).not.toContain("table");
    }
  });

  it("T3: a non-zero exit is an error carrying `error`", () => {
    const doc = createListAdapter("network ls").adapt(
      raw("", 1, "Cannot connect to the Docker daemon"),
      ctx("network ls"),
    );
    expect(doc.status).toBe("error");
    // C04 I3 — its absence is silent: C13 throws and the reader gets nothing (F35).
    expect(doc.error?.message).toContain("Cannot connect");
  });

  it("T4: `volume ls` keys on Name, because it has no ID", () => {
    const doc = createListAdapter("volume ls").adapt(raw(FIXTURES["volume ls"]!), ctx("volume ls"));
    const json = textOf(doc.blocks);
    expect(json).toContain("vscode");
    // Guessing `ID` here would have produced a column of empty cells.
    expect(json).not.toContain('"label":"ID"');
  });

  it("T5: `builder ls` renders docker's zero timestamp as `never`", () => {
    const doc = createListAdapter("builder ls").adapt(raw(FIXTURES["builder ls"]!), ctx("builder ls"));
    const json = textOf(doc.blocks);
    expect(json).toContain("never");
    // The far side's placeholder rendered as data is the thing to avoid.
    expect(json).not.toContain("0001-01-01");
  });

  it("T6: `context ls` reads a real boolean, not the string 'true'", () => {
    const doc = createListAdapter("context ls").adapt(raw(FIXTURES["context ls"]!), ctx("context ls"));
    expect(textOf(doc.blocks)).toContain("▸");
  });

  it("T7: a ragged line is counted rather than dropped in silence", () => {
    const doc = createListAdapter("network ls").adapt(
      raw(`${FIXTURES["network ls"]!}\nnot json at all`),
      ctx("network ls"),
    );
    expect(textOf(doc.blocks)).toContain("did not parse");
  });
});

describe("the resource inspect verbs", () => {
  it("T8: the single-element array is unwrapped, because that is what was asked for", () => {
    const doc = createResourceInspectAdapter("network inspect").adapt(
      raw('[{"Name":"bridge","Scope":"local"}]'),
      ctx("network inspect"),
    );
    const code = JSON.parse(textOf(doc.blocks))[0] as { kind: string; text: string };
    expect(code.kind).toBe("code");
    // Unwrapped: `docker inspect <one>` means one answer.
    expect(code.text.trimStart().startsWith("{")).toBe(true);
    expect(code.text).toContain('"Name": "bridge"');
  });

  it("T9: an empty array says so rather than rendering `[]`", () => {
    const doc = createResourceInspectAdapter("volume inspect").adapt(raw("[]"), ctx("volume inspect"));
    expect(textOf(doc.blocks)).toContain("nothing to inspect");
  });

  it("T10: unparseable output is shown rather than described", () => {
    const doc = createResourceInspectAdapter("image inspect").adapt(
      raw("<html>proxy error</html>"),
      ctx("image inspect"),
    );
    // A parse failure is the far side changing shape; the bytes are more useful
    // than a message about them.
    expect(textOf(doc.blocks)).toContain("proxy error");
  });
});
