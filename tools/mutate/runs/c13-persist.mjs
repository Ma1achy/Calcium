// C13 I20 / C05 I25 — session resume.
//
// **Every mutation here is silent when it survives**, which is why the run
// exists rather than the ten green rows being taken as the answer. A writer that
// persists too much leaves a file nobody looks at containing a container's
// environment; a writer that persists too little leaves a session that resumes
// short by one entry. Neither appears in a frame, and the first does not appear
// anywhere at all.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/transcript-persist.test.ts";
const SRC = "src/shell/transcript-persist.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The ruling deleted.** Everything is persisted, which is the state the
    // feature would have had if the redaction question had never been asked —
    // and it is invisible: the app works, the resume works, and a container's
    // environment is on disk.
    name: "every verb is persisted, declared or not",
    file: SRC,
    from: "  return policy.all || policy.declared.has(verb);",
    to: "  return true;",
    expect: "T1.28",
  },
  {
    // **Absent means yes**, the default inverted. It reads as the friendly
    // choice and it is the one C13 I20 refuses by name: a missing feature is
    // visible on the first resume and a leaked secret is not visible at all.
    name: "a verb is persisted unless it declares otherwise",
    file: SRC,
    from: "    if (tool.persist === true) declared.add(tool.name);",
    to: "    if (tool.persist !== false) declared.add(tool.name);",
    expect: "T1.29",
  },
  {
    // **The framework's own notices swept up by `"all"`.** A fault, a stall and
    // this module's own resume warning all carry `verb: null`, and they describe
    // a session that is over.
    name: "a document with no verb is persisted under `all`",
    file: SRC,
    from: '  if (verb === null || verb === "") return false;',
    to: "",
    expect: "T1.31",
  },
  {
    // **Seeding by count**, which is the shape the field looks like it wants.
    // The file is rewritten from what the writer holds, so this replaces a
    // thousand documents with the session's handful — data loss, not
    // inefficiency, and C20 records the same defect in the same words.
    name: "the loaded documents are counted rather than held",
    file: SRC,
    from: "        rows.push(`${JSON.stringify(row)}\\n`);\n      }",
    to: '        rows.push("");\n      }',
    expect: "T1.35",
  },
  {
    // **The seed renumbering from 1**, which is the shape the field had until
    // the diff was read: a session resuming a file whose rows are 5 and 6
    // appends `seq` 3, and the next load sorts the newest entry above them.
    name: "a resumed session restarts the sequence at one",
    file: SRC,
    from: "        seq = Math.max(seq, row.seq);",
    to: "        seq += 1;",
    expect: "T1.39",
  },
  {
    // **The rewind removed.** A failed write advances `issued`, so the row it
    // failed on is never re-offered and the next success writes past it.
    name: "a failed write drops its rows instead of rewinding",
    file: SRC,
    from: "        issued = from;\n        warn(",
    to: "        warn(",
    expect: "T1.33",
  },
  {
    // **`drain` from `issued` rather than `confirmed`.** Issued-but-unconfirmed
    // is exactly the command the user just ran, which is the entry the exit path
    // exists for.
    name: "drain writes from the last issued write",
    file: SRC,
    from: "      if (confirmed >= rows.length) return;\n      const slice = rows.slice(confirmed);",
    to: "      if (issued >= rows.length) return;\n      const slice = rows.slice(issued);",
    expect: "T1.34",
  },
  {
    // **The sequence number dropped from the envelope**, which is the format
    // this file had until a test could construct `issued > confirmed`: with no
    // key, a row `drain` wrote and the held append wrote again is two entries.
    name: "the load keys rows by position rather than by seq",
    file: SRC,
    from: "    if (valid.ok) bySeq.set(row.seq, valid.value);",
    to: "    if (valid.ok) bySeq.set(bySeq.size, valid.value);",
    expect: "T1.38",
  },
  {
    // **The load trusting the file.** This is untrusted input in the strongest
    // sense — a file on disk that anything could have written — and skipping the
    // validator puts a shape that looks like a document into the transcript,
    // where C13's own `append` would then throw on it.
    name: "a loaded line is trusted without validation",
    file: SRC,
    from: "    const valid = validateDocument(row.doc);\n    if (valid.ok) bySeq.set(row.seq, valid.value);\n    else discarded += 1;",
    to: "    bySeq.set(row.seq, row.doc as ViewDocument);",
    expect: "T1.36",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    from: "      rows.push(`${JSON.stringify({ seq, doc })}\\n`);",
    to: "      void doc;",
    why:
      "nothing is ever written — if this survives, no row reads the file and every kill below " +
      "is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
