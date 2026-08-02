#!/usr/bin/env node
// A real far side, for the tier-5 rows that need one.
//
// **It is an executable, and that is not a style choice.** C06 spawns
// `[binary, ...withJson(inv.argv)]` (`subprocess.ts`), so `binary` is a single
// element of an argv array — `node test/support/farside.mjs` is two, and
// `runner.spawn` would look for a program called `node test/support/farside.mjs`.
// Hence the shebang and the exec bit, both of which have to survive a clone.
//
// **It answers the manifest the suite already has**, rather than declaring verbs
// of its own. `test/support/manifest.fixture.json` is what every session in the
// suite is constructed from, and C18 refuses a verb the manifest does not declare
// long before a transport is consulted — so a `pwd` or a `big` verb here would be
// unreachable through a session, which is the only way these rows drive it. The
// three verbs below are the manifest's, and the properties the rows need are
// carried on them:
//
//   ps                the cwd and the pid, so a frame can prove it came from here
//   ps --limit N      N rows, so "a large document" is a flag rather than a verb
//   promote <target>  a settled document carrying `meta.resultId`, so `$_` resolves
//   tail              streams: true in the manifest, so C23 subscribes and the
//                     timeout is unbounded — the long-running verb Ctrl-C needs
//
// **Every argument position is exposed to `--json`.** C06 appends it to every
// invocation (D16), so this program cannot assume argv[3] is its own. The one
// time that was assumed, `emitter.mjs` computed `NaN` lines, cleared no interval
// and hung until the PTY timed out; its header records it. Flags are read by
// name, unknown tokens are ignored, and no positional argument is read by index
// except the one verb that declares a required argument.
//
// **No pacer is imported.** The plan called for `emitter.mjs`'s timing loop to be
// shared here. Once the verbs were constrained to the manifest, nothing in this
// file does the pacer's job — emit a fixed total at a fixed rate — because
// `ps --limit N` is a single document and `tail` runs until it is signalled. A
// second caller invented to justify the reuse would be the same disposal error as
// widening an interface nothing calls, so `emitter.mjs` stays untouched and
// single-purpose.

const argv = process.argv.slice(2);
const verb = argv[0] ?? "";
const rest = argv.slice(1);

/** A flag's value, by name, in either `--k v` or `--k=v` form. `null` when absent. */
const flag = (...names) => {
  for (const name of names) {
    const bare = `--${name}`;
    const short = name.length === 1 ? `-${name}` : null;
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === bare || token === short) return rest[i + 1] ?? "";
      if (token !== undefined && token.startsWith(`${bare}=`)) return token.slice(bare.length + 1);
    }
  }
  return null;
};

/**
 * `emitter.mjs`'s guard, for the same reason: a flag value is not a number.
 *
 * **Absence is checked before the coercion, and that is the whole of it.**
 * `Number(null)` is `0` and `Number("")` is `0`, both finite — so a guard that
 * only asked `Number.isFinite` accepted a flag that was never passed and answered
 * `--limit 0`. `ps` then emitted a table with no rows, the document validated, and
 * the frame showed a header over "Nothing to show." — a far side that ran, was
 * reached, and rendered as though it had nothing to say. Found by reading the
 * frame, which no assertion about the far side being *reached* would have caught.
 */
const numeric = (value, fallback) => {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** The flags this program reads a *value* for. Everything else stands alone. */
const VALUED = new Set(["--limit", "-n"]);

/**
 * The first token that is neither a flag nor a flag's value.
 *
 * **Only known value-taking flags consume the next token**, which is the safe
 * direction. The opposite rule — every `--flag` swallows what follows — reads
 * `promote --json app.web:main` as a promotion of nothing, and `--json` is a flag
 * this program never asked for and cannot refuse (D16). Guessing wrong about an
 * unknown flag must cost an ignored token, not the argument.
 */
const positional = () => {
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === undefined) continue;
    if (token.startsWith("-")) {
      if (VALUED.has(token)) i += 1;
      continue;
    }
    return token;
  }
  return null;
};

/**
 * A complete `tui.view/1` document.
 *
 * Every field C04 requires, because C07's identity route **validates** rather
 * than sniffing (C07 I5): a payload with a `schema` and a partial `meta` is not a
 * partial document, it is a rejected one, and the fallback renders it as a table.
 * That failure is indistinguishable from this program not having run.
 *
 * `meta.transport` and `meta.exitCode` are stated and then overwritten — C07 I13
 * gives the registry authority over everything but `resultId`, `adapter` and
 * `truncated`. They are written anyway so the document validates on its own.
 */
const document = (blocks, meta = {}) => ({
  schema: "tui.view/1",
  command: [verb, ...rest].join(" "),
  status: "ok",
  blocks,
  meta: {
    verb,
    adapter: "identity",
    exitCode: 0,
    durationMs: 1,
    truncated: false,
    argv: [verb, ...rest],
    stderr: "",
    transport: "subprocess",
    origin: "user",
    ...meta,
  },
});

const emit = (doc) => {
  process.stdout.write(`${JSON.stringify(doc)}\n`);
};

switch (verb) {
  // **The cwd is read here, at answer time.** C06 commitment 14 says the
  // transport reads `cwd` at spawn rather than capturing it, and C22 threads
  // `session.cwd` as a function for the same reason. This is the far side's half
  // of that claim: a `cd` between two invocations moves the second one, and this
  // is the only place the moved directory can actually be observed from.
  case "ps": {
    const limit = Math.max(0, Math.min(20_000, numeric(flag("limit", "n"), 2)));

    // **`--search=prose` answers with wrapping text instead of a table**, and it
    // exists because a table does not wrap: C11 truncates a cell to its column
    // (`runni~`), so a `ps` document is exactly as many rows at 64 columns as at
    // 120. C04 T5.2 walks the same document at four widths and every pass was
    // eleven screenfuls — the fixture agreeing with a working resize and a
    // broken one alike, which is the trap `test/support/viewport.ts` records one
    // tier down and the reason `wrappingDoc` exists there.
    //
    // A manifest-declared flag rather than a new verb: C18 refuses a verb the
    // manifest does not declare before a transport is consulted, and `--search`
    // is already `ps`'s.
    if (flag("search") !== null) {
      const prose =
        "a considerably longer line of prose that occupies several rows at sixty-four " +
        "columns and appreciably fewer at a hundred and twenty, which is the whole " +
        "point of it";
      emit(
        document(
          Array.from({ length: limit }, (_, i) => ({
            kind: "notice",
            id: `n${String(i)}`,
            tone: "info",
            // **The index at both ends, and the tail one is the load-bearing
            // half.** Wrapped prose repeats: every one of these notices ends
            // with the same continuation row, so a test that identifies the
            // document's last row by its text matches the second row of the
            // document as readily as the last. C04 T5.2 stopped its walk on the
            // first screenful for exactly that reason.
            text: `${String(i).padStart(7, "0")} ${prose} #${String(i).padStart(7, "0")}`,
          })),
        ),
      );
      break;
    }

    const rows = [];
    for (let i = 0; i < limit; i += 1) {
      rows.push({
        id: `p${String(i)}`,
        cells: {
          uuid: { text: `${String(i).padStart(7, "0")}` },
          status: { text: i % 3 === 0 ? "running" : "queued" },
        },
      });
    }

    emit(
      document([
        {
          // The value only this program can produce. A row asserting "a frame
          // appeared" passes against a session that answered from a fixture; this
          // is what makes the subprocess arm distinguishable from every other one.
          kind: "notice",
          id: "far-side",
          tone: "info",
          // **The argv it was actually spawned with**, which is the only place
          // a test can see what reached the process. C18 expands `$_` at parse
          // time and D24 says the displayed command and the spawned argv
          // correspond — and nothing renders the displayed command, so the
          // spawned half is the observable one.
          text:
            `far side pid=${String(process.pid)} cwd=${process.cwd()} ` +
            `argv=${[verb, ...rest].join(" ")}`,
        },
        {
          kind: "table",
          id: "ps-table",
          columns: [
            { key: "uuid", label: "uuid", align: "left", priority: 10, minWidth: 8, sortable: false },
            { key: "status", label: "status", align: "left", priority: 5, minWidth: 6, sortable: false },
          ],
          rows,
        },
      ],
      // **A result identifier, so `$_` has something to resolve to** (C18 §7).
      // `resultId` is one of the three fields C07 I13 carries across from the
      // far side's own `meta`; every other field here is overwritten. Without it
      // `$_` is the *no previous result* error, which is a different row.
      { resultId: "018f2a7c-4d3e-7c1a-9b52-0e5a1f9c3d7b" }),
    );
    break;
  }

  // `resultId` is one of the three fields C07 I13 carries across from the far
  // side's own `meta`, which is what makes `$_` resolvable at all.
  case "promote": {
    const target = positional() ?? "nothing";
    emit(
      document(
        [{ kind: "notice", id: "n1", tone: "info", text: `promoted ${target}` }],
        { resultId: "018f2a7c-4d3e-7c1a-9b52-0e5a1f9c3d7b" },
      ),
    );
    break;
  }

  // **Long-running, and it does not stop on its own.** The manifest declares
  // `streams: true`, so C23 subscribes and passes `timeoutMs: 0` — unbounded, per
  // C06 commitment 7. Every row that uses this one ends it: Ctrl-C through the
  // ladder, an external kill, or the session releasing.
  //
  // Lines before the signal are the ones C06 I7 says must survive it, so it
  // writes several immediately rather than waiting out its first interval.
  //
  // **The first patch carries the pid**, so a test can kill *this* child rather
  // than pattern-matching a command line. `pkill -f "farside.mjs tail"` matches
  // the shell that invoked the test as well — the pattern is in its own argv —
  // so the first attempt at the external-kill row killed its own harness. A pid
  // the far side reported is evidence nothing else can have produced.
  case "tail": {
    let n = 0;
    const write = () => {
      n += 1;
      process.stdout.write(
        `${JSON.stringify({ line: n, pid: process.pid, text: `tail ${String(n)}` })}\n`,
      );
    };
    write();
    write();
    write();
    setInterval(write, 100);
    break;
  }

  // The manifest's `oneShot` verb. It has no reader in `src/` — nothing parses
  // argv at launch, so C22 §4's gate-1 exception has no subject — and it is
  // answered here so that the day it does, the far side is not the missing piece.
  case "dashboard": {
    emit(document([{ kind: "notice", id: "d1", tone: "info", text: "one frame" }]));
    break;
  }

  default: {
    // A result, not a crash. C06 T3.17's shape from the other side: a far side
    // that refuses a verb reports on stderr and exits non-zero, and the session
    // renders that rather than dying with it.
    process.stderr.write(`far side: unknown verb ${JSON.stringify(verb)}\n`);
    process.exit(2);
  }
}
