// C20 tier 2 — contract. Redaction against §7b's table, and the four things a
// source scan sees that no behavioural test can.
//
// The corpus is the important one. `j22` R12's entropy-only rule clears every
// UUID and every Git SHA — 36 and 40 characters at roughly four bits each — and
// those are the commonest arguments in this tool, so the feature it specified
// destroys exactly the entries people want back.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { redact, type Rule } from "../../src/interaction/history/index.js";
import { COMMANDS, openWith, seedFiles, entry } from "../support/history.js";

/** The text and the rules that produced it — asserting one without the other is half a test. */
function fired(command: string): Readonly<{ text: string; rules: readonly Rule[] }> {
  const done = redact(command);
  return { text: done.text, rules: done.fired.map((f) => f.rule) };
}

const UUID = "7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12";
const SHA = "e3b0c44298fc1c149afbf4c8996fb924";
const SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("T2.1 (I5) — the corpus survives", () => {
  // Every one of these clears `j22`'s bar, and every one of them is an
  // identifier this tool prints and people paste back.
  const intact = [
    `/ps ${UUID}`,
    `/logs --run=${UUID}`,
    `/promote ${SHA}`,
    `/promote ${SHA256}`,
    "/deploy --version=1.24.0-rc.3",
    "/logs --path=/var/folders/T/x9f2kd8s0shx7q1p/prism-run",
    "/logs ./relative/path/to/a/log/file.txt",
    "/ps --family=digit-classifier --status=running --include-deleted",
    "/promote 7f3a2c1",
  ];

  for (const command of intact) {
    it(`survives: ${command}`, () => {
      expect(fired(command)).toEqual({ text: command, rules: [] });
    });
  }
});

describe("T2.2, T2.12 (I5, I24–I26) — §7b's table, rule by rule", () => {
  // Input → what reaches disk, *and which rule fired*. A row that produces the
  // right string through the wrong rule is a redactor about to produce a wrong
  // string for the next input, and asserting output alone cannot tell them
  // apart — which is how four of these six defects read as correct in §3.
  const rows: readonly (readonly [string, string, readonly Rule[]])[] = [
    // P1 beats the exemptions: being an identifier does not make a flagged
    // value safe.
    [`/ps --token=${UUID}`, "/ps --token=[REDACTED]", ["P1"]],
    ["/ps --api-key foo", "/ps --api-key [REDACTED]", ["P1"]],
    ["/ps --password hunter2", "/ps --password [REDACTED]", ["P1"]],
    ["/ps --gitlab-token=abc", "/ps --gitlab-token=[REDACTED]", ["P1"]],
    ["GITLAB_PASSWORD=hunter2 /deploy", "GITLAB_PASSWORD=[REDACTED] /deploy", ["P2"]],

    // B1: `/token/` matches `--tokens`, and a redactor that eats a count is one
    // people turn off.
    ["/ps --tokens=3", "/ps --tokens=3", []],
    // B2: without the leading-dash guard the *following flag* is destroyed and
    // the entry stops describing what was run.
    ["/deploy --api-key --verbose", "/deploy --api-key --verbose", []],
    ["/deploy --password=", "/deploy --password=", []],

    // B3: the assignment inside a quoted delegation, which is how a secret
    // actually reaches the shell path, and the same rule in a URL.
    [
      'sh -c "GITLAB_PASSWORD=hunter2 deploy"',
      'sh -c "GITLAB_PASSWORD=[REDACTED] deploy"',
      ["P2"],
    ],
    [
      "curl 'https://host/api?private_token=abc123&page=2'",
      "curl 'https://host/api?private_token=[REDACTED]&page=2'",
      ["P2"],
    ],

    // B4: the base64 alphabet contains `/`, so "contains a slash" exempts the
    // thing the entropy net exists for.
    ["/upload Zm9vYmFy/YmF6cXV4+OTk5OTk5OTk5OQ==", "/upload [REDACTED]", ["E"]],
    // Padded, and the padding is what made the first attempt miss it: `x==`
    // parses as an assignment whose value is empty, so the net measured the
    // empty half and the blob went past as a name.
    ["/upload ijx3IdkOu1RvEsOaQI5tMwrFcSjvWw==", "/upload [REDACTED]", ["E"]],
    [
      "/upload dGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZyAxMjM0",
      "/upload [REDACTED]",
      ["E"],
    ],

    // B5: a SHA-256 is an identifier, and 7–40 would have destroyed it.
    [`/promote --sha=${SHA256}`, `/promote --sha=${SHA256}`, []],

    // The net working as intended, on a shape nothing recognises.
    ["/deploy ghp_16C7e42F292c6912E7710c838347Ae178B4a", "/deploy [REDACTED]", ["E"]],

    // Accepted, and recorded rather than discovered later: a 32-character hex
    // string that genuinely is a secret survives, because the alternative
    // destroys every digest in the history.
    [`/deploy ${SHA}`, `/deploy ${SHA}`, []],

    // Idempotent.
    ["/ps --token=[REDACTED]", "/ps --token=[REDACTED]", ["P1"]],
  ];

  for (const [input, output, rules] of rows) {
    it(`${input} → ${output}`, () => {
      expect(fired(input)).toEqual({ text: output, rules });
    });
  }

  it("I19: a secret on the third line of a multi-line command", () => {
    const command = "/deploy \\\n  --target=prod \\\n  GITLAB_PASSWORD=hunter2";
    expect(redact(command).text).toBe(
      "/deploy \\\n  --target=prod \\\n  GITLAB_PASSWORD=[REDACTED]",
    );
  });

  it("I19: an unparseable paste still gets scanned", () => {
    // An unbalanced quote — C18 cannot tokenise it, and a paste is not obliged
    // to be valid input. The whitespace split is what stops that being a hole.
    const command = `/deploy "unclosed --token=${UUID}`;
    expect(redact(command).text).toBe('/deploy "unclosed --token=[REDACTED]');
  });
});

describe("T2.3 (I6) — the session keeps what the disk does not", () => {
  it("the entry is whole in memory and redacted on disk", async () => {
    const { store, fs } = await openWith();
    store.append("/deploy --token=ghp_16C7e42F292c6912E7710c838347Ae178B4a", 0);
    await store.flush();

    expect(store.entries[0]?.command).toBe(
      "/deploy --token=ghp_16C7e42F292c6912E7710c838347Ae178B4a",
    );
    expect(fs.files.get(COMMANDS)).toBe("/deploy --token=[REDACTED]\n");
    // Not one fragment of it, which is what T5.4 asserts from the far end.
    expect(fs.files.get(COMMANDS)).not.toContain("ghp_");
  });

  it("T2.8: entries is immutable", async () => {
    const { store } = await openWith(seedFiles([entry("/ps", 1)]));
    expect(() => {
      (store.entries as unknown as string[]).push("nope");
    }).toThrow();
  });
});

describe("T2.9 (I17) — warnings are returned, never emitted", () => {
  it("a corrupt file and a failed write both report through `warnings`", async () => {
    const writes: string[] = [];
    const out = process.stdout.write.bind(process.stdout);
    const err = process.stderr.write.bind(process.stderr);
    // Recording rather than asserting inside the call, so a write is reported
    // as a test failure rather than as output nobody reads.
    process.stdout.write = ((chunk: string) => (writes.push(String(chunk)), true)) as never;
    process.stderr.write = ((chunk: string) => (writes.push(String(chunk)), true)) as never;

    try {
      const { store, fs } = await openWith({ [COMMANDS]: "bad\\qescape\n" });
      expect(store.warnings).toHaveLength(1);

      fs.fail("readOnly");
      store.append("/ps", 0);
      store.append("/logs", 0);
      await store.flush();
    } finally {
      process.stdout.write = out;
      process.stderr.write = err;
    }

    expect(writes).toEqual([]);
  });

  it("T3.7 (I8): once per cause, not once per command", async () => {
    const { store, fs } = await openWith();
    fs.fail("readOnly");
    for (let i = 0; i < 20; i += 1) store.append(`/ps ${String(i)}`, 0);
    await store.flush();

    expect(store.warnings).toHaveLength(1);
    expect(store.entries).toHaveLength(20);
  });
});

describe("T2.4, T2.5, T2.6, T2.10 — the source scan, from C20's side", () => {
  // SS9 and MG18 are the mechanical halves and run in `make enforce`. This is
  // the half that says what the rules are *for*, and it fails for a reason a
  // reader can act on rather than as a regex mismatch in a tools directory.
  function filesIn(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      if (statSync(path).isDirectory()) filesIn(path, out);
      else if (path.endsWith(".ts")) out.push(path);
    }
    return out;
  }

  const code = (file: string): string =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => {
        const start = line.trimStart();
        return !start.startsWith("//") && !start.startsWith("*") && !start.startsWith("/*");
      })
      .join("\n");

  it("no clock, no fs, no hardcoded dot-directory path, no C17, no terminal/", () => {
    for (const file of filesIn("src/interaction/history")) {
      const source = code(file);
      expect(source, `${file}: the clock is injected, or a timestamp is untestable`).not.toMatch(
        /\bDate\.now|new Date\(|performance\.now/,
      );
      expect(source, `${file}: the filesystem is injected through HistoryFs`).not.toMatch(
        /from\s+["']node:fs["']/,
      );
      expect(
        source,
        `${file}: a hardcoded state directory makes standalone development append to a real install`,
      ).not.toMatch(/~\/\.prism/);
      expect(source, `${file}: C20 returns strings and L4 applies them (I1)`).not.toMatch(
        /from\s+["'][^"']*\/editor\//,
      );
      expect(source, `${file}: no width, no frame, no escape sequence (I15)`).not.toMatch(
        /from\s+["'][^"']*terminal\//,
      );
    }
  });

  it("T2.10 (I18): `appendFileSync` is called from exactly one place, and it is `drain`", () => {
    const persist = readFileSync("src/interaction/history/persist.ts", "utf8");
    // Two calls, one per file, and both of them inside `drain` — which is the
    // half that matters: a synchronous write anywhere else is the exit path's
    // escape used on a path that could have awaited.
    expect([...persist.matchAll(/fs\.appendFileSync\(/g)]).toHaveLength(2);
    const drain = persist.slice(persist.indexOf("    drain() {"), persist.indexOf("    get warnings()"));
    expect(drain).not.toBe("");
    expect([...drain.matchAll(/fs\.appendFileSync\(/g)]).toHaveLength(2);

    // `types.ts` declares it, which is the seam being narrow rather than a
    // second caller; what must not exist is a second *call*.
    for (const file of filesIn("src/interaction/history")) {
      if (file.endsWith("persist.ts")) continue;
      expect(readFileSync(file, "utf8"), `${file}: the exit path is the writer's`).not.toMatch(
        /\bfs\.appendFileSync\(/,
      );
    }
  });
});
