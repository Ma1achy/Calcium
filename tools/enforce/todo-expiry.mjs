// A deferral that cannot outlive its reason.
//
// C04 lands with roughly half its suite deferred, nearly all of it on one
// component. Nothing announces when those become writable: `grep` works only if
// someone remembers to grep, and the person landing C09 has no reason to.
//
// This is SS26's lesson applied to `it.todo`. SS26 scoped itself to
// `src/data/process/` while the tree had `src/data/process.ts` — a file, not a
// directory — so the rule matched nothing and reported compliance for as long as
// anyone cared to look. A rule with nothing to be wrong about passes exactly
// like a rule that is satisfied.
//
// Two directions, and both are required:
//
//   - A todo waiting on a component whose source file **exists** fails. That is
//     the point: it is the notification nobody would otherwise send.
//   - A todo naming a component with **no map entry** fails. Otherwise a typo in
//     a blocker name — `waits on CO9` — exempts a test forever, silently, which
//     is the same failure in a different coat.
//
// A map entry with no deferred tests is fine. Components get built.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";

/**
 * Component id → the source file whose existence means "implemented".
 *
 * Every component that can be named as a blocker needs a row, whether or not
 * anything currently waits on it.
 *
 * **A row names the file that must contain the behaviour**, which is not always
 * the first file of the component's directory. C21 is the case that forced the
 * distinction: its interface landed early because C06 cannot be built without
 * `ProcessRunner`, so `src/data/process/types.ts` exists while the runner does
 * not. Pointing the row at the directory's first file would have expired three
 * deferrals that are genuinely still waiting.
 *
 * `defaultIsImplemented` already ignores a bare `export {}`, so a scaffold does
 * not trip this. The case it does not cover — and the reason the rule needs a
 * human-chosen path rather than a cleverer check — is a file holding a
 * re-export or a type declaration: real content, no behaviour, and the rule
 * cannot tell the difference. Choose the path deliberately.
 */
export const COMPONENT_SOURCES = Object.freeze({
  C01: "src/terminal/lifecycle.ts",
  C02: "src/terminal/capabilities.ts",
  C03: "src/terminal/frame-scheduler.ts",
  C04: "src/data/viewmodel/index.ts",
  C05: "src/data/manifest/index.ts",
  C06: "src/data/transport/index.ts",
  C07: "src/data/adapters/index.ts",   // the directory's barrel — `adapters.ts` never existed (TD3)
  C08: "src/data/fixtures/index.ts",
  C09: "src/presentation/blocks/index.ts",
  C10: "src/presentation/theme/index.ts",
  C11: "src/presentation/table/definition.ts",   // the definition, not the barrel
  C12: "src/presentation/plot/definition.ts",   // the definition, not the barrel — and `plot.ts` never survived SS24 (TD3)
  C13: "src/viewport/transcript/store.ts",   // the store, not the barrel — and `transcript.ts` was the scaffold (TD3, fourth instance)
  C14: "src/viewport/viewport/viewport.ts",   // the viewport, not the barrel — `viewport.ts` was the scaffold (TD3, fifth instance)
  C15: "src/viewport/overlay/manager.ts",   // the manager, not the barrel — and `overlays.ts` was the scaffold (TD3, sixth instance)
  // The dispatcher, now that it exists. It pointed at the scaffold while only
  // `decode.ts` was built, which was the right signal then — `defaultIsImplemented`
  // ignores a bare `export {}`. Repointing it at the unwritten path *ahead* of
  // time was tried and TD3 caught it: a path that does not exist reads as "not
  // implemented" forever, silently exempting every deferral waiting on it.
  C16: "src/interaction/router/router.ts",
  // The editor, now that it exists — `editor.ts` was the scaffold (TD3, seventh
  // instance). Repointed on the commit that makes the path real, never before:
  // a path that does not exist reads as "not implemented" forever.
  C17: "src/interaction/editor/editor.ts",
  // The parser, now that it exists — the barrel was the scaffold (TD3, eighth
  // instance). Repointed on the commit that makes `parse.ts` real, never
  // before: a path that does not exist reads as "not implemented" forever.
  C18: "src/interaction/parser/parse.ts",
  // The engine, now that it exists — `completion.ts` was the scaffold (TD3,
  // ninth instance). Repointed on the commit that makes `engine.ts` real, never
  // before: a path that does not exist reads as "not implemented" forever, so
  // every deferral waiting on C19 would be silently exempt.
  //
  // The engine rather than the barrel or `types.ts`: the barrel is re-exports
  // and `types.ts` is declarations, and TD3's rule is that a row names the file
  // that must contain the *behaviour*.
  C19: "src/interaction/completion/engine.ts",
  // The store, now that it exists — `history.ts` was the scaffold (TD3, tenth
  // instance). Repointed on the commit that makes `store.ts` real, never
  // before: a path that does not exist reads as "not implemented" forever, so
  // every deferral waiting on C20 would be silently exempt.
  C20: "src/interaction/history/store.ts",
  C21: "src/data/process/runner.ts",   // the runner, not process/types.ts — see above
  C22: "src/shell/session.ts",
  C23: "src/shell/execution.ts",
  C24: "src/index.ts",
  C25: "src/presentation/patch/definition.ts",   // the definition, not the barrel — and `blocks/patch.ts` never existed (TD3, third instance)
});

/**
 * Layers are legitimate blockers too — "waits on L4" means the shell, which is
 * not one component. Mapped to the file whose existence means that layer runs.
 *
 * **L4 points at C23's file, not C22's, and the difference is thirty-five
 * deferrals.** Both components live in `src/shell/`, so the row looks
 * interchangeable and is not: "the L4 shell runs" means it can *execute a
 * command*, and until C23 exists a constructed graph cannot. Pointed at
 * `session.ts`, the commit that made C22 real expired all thirty-five `L4`
 * deferrals at once — thirty of them tier-5 PTY tests that launch a session and
 * run something — and the cheap repair would have been to list them as an
 * acknowledged backlog, which is the exemption-list-that-only-grows this rule
 * exists to prevent.
 *
 * `execution.ts` exists today as a scaffold holding `export {}`, so
 * `defaultIsImplemented` returns false for the right reason rather than by
 * absence, and TD3 passes. It self-expires on the commit that gives C23
 * behaviour, which is the same commit that makes those thirty-five writable.
 */
export const LAYER_SOURCES = Object.freeze({
  L4: "src/shell/execution.ts",
});

/**
 * Identifiers, in the blocker clause. Two failures shaped this, both found by
 * running the rule rather than by reasoning about it:
 *
 *   - Matching the *words* after "waits on" produced blockers called "A" and
 *     "THE", from titles like "waits on a real render tree (C09)" — which names
 *     its blocker perfectly well, in parentheses, after four words of English.
 *   - Matching identifiers anywhere in the *whole title* then read
 *     "moving the registry into C04 … waits on C09 and C10" as waiting on C04,
 *     which is the component the test belongs to, not one it waits for.
 *
 * So: identifiers only, and only inside the blocker clause. Prose before it is
 * the description.
 *
 * **The third failure was prose *after* it, and it is why the clause now ends.**
 * Reading to end of line meant a sentence explaining a correction parsed as part
 * of the claim: restating two deferrals as "waits on L4, which owns the routing;
 * C18 produces both results now" left them waiting on C18 — the component the
 * sentence exists to say they no longer wait for. Three incidents, and the
 * standing remedy was to put the explanation *before* the clause, which is a
 * habit rather than a mechanism.
 *
 * The clause ends at a sentence delimiter: an **em dash**, a **period**, or a
 * **closing paren**. That is how these titles are already written, and it keeps
 * the multi-blocker form — `waits on L4 and C20` has no delimiter in it, so it
 * survives whole, which the obvious fix (take the first identifier) does not.
 *
 * **A closing paren counts only when it is unmatched within the clause**, and
 * the corpus is what forces the qualification. `waits on a real render tree
 * (C09) and a terminal emulator` is the shape the first failure produced, and a
 * naive paren rule would cut it at `(C09` — harmless there, and not harmless in
 * `waits on L4 (the shell) and C20`, where it would drop a blocker silently.
 * Dropping a blocker is the exact defect this rule exists to prevent, so the
 * paren terminates only a clause that was itself parenthetical.
 */
const IDENTIFIER = /\b(C\d{2}|L\d)\b/g;
const WAITS_ON = /waits on/i;
const TODO_TITLE = /\bit\.todo\s*\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`([^`]*)`)/gs;

/**
 * A source file counts as implemented when it exists AND carries more than the
 * scaffold's `export {}`. Existence alone would fire on the stubs the repo ships
 * from day one, which would make the rule fail everywhere immediately and get it
 * deleted within the hour.
 */
export function defaultIsImplemented(path) {
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  return body.replace(/export\s*\{\s*\}\s*;?/g, "").trim().length > 0;
}

/** Extract every `it.todo` title from a source string. */
export function todoTitles(source) {
  const out = [];
  TODO_TITLE.lastIndex = 0;
  let m;
  while ((m = TODO_TITLE.exec(source))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

/**
 * Component and layer ids named as blockers in one title.
 *
 * Returns `null` when the title declares a wait but names nothing recognisable
 * — the typo case (`waits on CO9`, letter O), which must be a violation rather
 * than a silent exemption. An empty array means the title declares no wait.
 */
/**
 * Where the blocker clause ends: an em dash, a period, or an unmatched `)`.
 *
 * A period only counts at a word boundary — followed by a space or the end —
 * so a version or a filename inside a clause does not truncate it.
 */
export function blockerClause(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      if (depth === 0) return text.slice(0, i);
      depth -= 1;
    } else if (ch === "\u2014") return text.slice(0, i);
    else if (ch === "." && (i + 1 === text.length || text[i + 1] === " ")) {
      return text.slice(0, i);
    }
  }
  return text;
}

export function blockersIn(title) {
  const start = title.search(WAITS_ON);
  if (start === -1) return [];

  const clause = blockerClause(title.slice(start));
  const ids = new Set();
  IDENTIFIER.lastIndex = 0;
  let m;
  while ((m = IDENTIFIER.exec(clause))) ids.add(m[1].toUpperCase());

  return ids.size === 0 ? null : [...ids];
}

/**
 * The check, as a pure function over its inputs.
 *
 * `entries` is `[{file, title}]`; `sources` is the component map; `isImplemented`
 * decides whether a path counts as built. All three are parameters so the rule
 * can be run against fabricated input and shown to fire — A03 commitment 14.
 */
export function checkTodoExpiry(
  entries,
  sources = { ...COMPONENT_SOURCES, ...LAYER_SOURCES },
  isImplemented = defaultIsImplemented,
) {
  const violations = [];
  const expired = new Map();

  for (const { file, title } of entries) {
    const blockers = blockersIn(title);

    if (blockers === null) {
      violations.push({
        rule: "TD1",
        file,
        message:
          `todo says "waits on" but names no component or layer id — ` +
          `an unrecognisable blocker never expires, so a typo exempts a test forever. ` +
          `Title: ${JSON.stringify(title.slice(0, 90))}`,
        spec: "A03 commitment 14",
      });
      continue;
    }

    for (const id of blockers) {
      const path = sources[id];

      if (path === undefined) {
        violations.push({
          rule: "TD1",
          file,
          message:
            `todo waits on "${id}", which has no entry in COMPONENT_SOURCES — ` +
            `an unmapped blocker never expires, so a typo exempts a test forever`,
          spec: "A03 commitment 14",
        });
        continue;
      }

      if (isImplemented(path)) {
        const key = `${id} ${path}`;
        if (!expired.has(key)) expired.set(key, { id, path, files: [] });
        expired.get(key).files.push(file);
      }
    }
  }

  for (const { id, path, files } of expired.values()) {
    violations.push({
      rule: "TD2",
      file: path,
      // **The count is part of the identity, not decoration** — see `backlogKey`.
      count: files.length,
      message:
        `${id} is implemented (${path} exists); ${files.length} test${files.length === 1 ? "" : "s"} ` +
        `still wait on it — write them, or restate what they are actually waiting for`,
      spec: "A03 commitment 14",
    });
  }

  return violations;
}

/**
 * How an acknowledged violation is identified, for TD0's equality.
 *
 * **The count is in the key, and that is the whole of this function.** A row was
 * `"<rule> <file>"`, which groups every deferral in one file into one string —
 * so two acknowledged deferrals in `session.ts` and *three* produce the same
 * key, and a third silently inherits an exemption argued for two. The list that
 * exists to stop exemptions growing could not see one grow.
 *
 * Found by asking what the key cannot distinguish rather than by a failure,
 * which is the only way this kind is found: an over-broad key reports
 * compliance for exactly the case it was written to catch (A03 §2).
 *
 * The alternative was a key per test id, which means TD2 emitting one violation
 * per deferral instead of one per component. That loses the grouped message —
 * "6 tests still wait on it" is the useful line — for the same discrimination,
 * so the count is the cheaper half of the same guarantee.
 *
 * Exported so TD0 and its fabrication use one implementation. A test carrying
 * its own copy of the key format agrees with itself under any change to it.
 */
export function backlogKey(violation) {
  return violation.count === undefined
    ? `${violation.rule} ${violation.file}`
    : `${violation.rule} ${violation.file} (${String(violation.count)})`;
}

/**
 * Deferrals whose blocker already exists, acknowledged rather than hidden.
 *
 * This rule found these on the day it was written: C01 shipped, and seven tests
 * across C02's and C03's suites are still waiting on it. They are writable now.
 *
 * An exemption list is the thing this rule exists to prevent, so it has teeth:
 * the suite asserts the real tree's violations **equal** this list exactly. A
 * new expiry fails immediately, because it is not in the list. Removing an entry
 * is an ordinary edit; adding one is a deliberate act with a reason beside it,
 * and the count is visible to anyone who opens the file.
 *
 * Each entry is `"<rule> <file>"` plus why it has not been written yet.
 */
/**
 * **Empty, and the equality assertion is what keeps it that way.**
 *
 * It held one entry — `TD2 src/terminal/lifecycle.ts` — which read as one item
 * and was seven: C02's tier-4 and tier-5 tests, deferred while C01 was a spec
 * and never revisited. They are written now.
 *
 * A new expiry fails because it is not in this list, and adding it back is a
 * decision someone has to make and defend in a diff rather than a default that
 * accumulates. That is the whole mechanism: the list may exist, but it starts
 * from nothing and every entry costs a sentence.
 */
export const ACKNOWLEDGED_BACKLOG = Object.freeze([
  // **Two deferrals wait on C22's paint path, which is inside C22 and unbuilt.**
  //
  //   - `test/contract/surfaces.test.ts` — S01 §2's illustrated rows.
  //   - `test/e2e/frame-scheduler.test.ts` T5.4 — edge-drag with no blank frame.
  //
  // `compose()` returns the frame's parts; nothing yet turns them into rows, so
  // neither test has anything to assert against. Every other C22 deferral that
  // came due on this commit was written (C01 T4.5 and T4.6, C14 T4.7 and T4.8)
  // or moved to the component it was really waiting for (C13 T4.7 → C23).
  //
  // **The entry is coarser than the finding, and that is a known weakness.**
  // A row is `"<rule> <file>"`, so this one silently covers a *third* deferral
  // naming C22 in either file. The remedy is to keep it short-lived rather than
  // to build per-test granularity for two rows: it goes when the paint path
  // lands, and TD0 compares by equality, so a resolved entry left here fails
  // just as loudly as a new expiry.
  // The count is load-bearing: a third deferral in either file changes the key
  // and fails TD0, rather than inheriting an exemption argued for two.
  "TD2 src/shell/session.ts (2)",
]);

/**
 * Components with no scaffold in the tree at all, each with its reason.
 *
 * A mapped path that is simply absent is TD3's violation; this is the one
 * legitimate absence — a component whose file has never been created, where
 * `defaultIsImplemented` returning false is the right answer for the right
 * reason. Named rather than tolerated, so the day the file appears the entry is
 * the thing that has to be removed.
 */
export const UNSCAFFOLDED = Object.freeze({
  // Empty, and C25 emptying it is the entry doing its job: it named an absence
  // with a reason, and the reason expired on the commit that created the file.
});

/**
 * TD3 — every path the map names must exist.
 *
 * `defaultIsImplemented` returns false for a file that is not there, so a mapped
 * path that never existed **exempts every deferral waiting on that component,
 * silently and permanently**: the rule reports compliance, and the reason it
 * reports compliance is that it cannot find the component it was asked about.
 *
 * Not hypothetical. `C07` mapped to `src/data/adapters.ts` while C07 landed as
 * `src/data/adapters/index.ts`, so every "waits on C07" todo was exempt from the
 * day the map was written — SS26's defect inside the machinery built to catch
 * SS26's defect. It also catches the other direction: C11 moving
 * `src/presentation/table.ts` to `src/presentation/table/` to satisfy A03 SS24
 * would have exempted C11's seven deferrals on the commit that made them
 * writable.
 */
export function checkSourceMap(
  sources = { ...COMPONENT_SOURCES, ...LAYER_SOURCES },
  unscaffolded = UNSCAFFOLDED,
  exists = existsSync,
) {
  const violations = [];

  for (const [id, path] of Object.entries(sources)) {
    if (exists(path)) {
      if (unscaffolded[id] !== undefined) {
        violations.push({
          rule: "TD3",
          file: path,
          message:
            `${id} is listed unscaffolded and ${path} now exists — ` +
            `remove the entry, or the absence it excuses stops being an absence`,
          spec: "A03 commitment 16",
        });
      }
      continue;
    }

    if (unscaffolded[id] !== undefined) continue;

    violations.push({
      rule: "TD3",
      file: path,
      message:
        `${id} maps to ${path}, which does not exist — a missing path reads as ` +
        `"not implemented" forever, so every todo waiting on ${id} is silently exempt`,
      spec: "A03 commitment 16",
    });
  }

  return violations;
}

// --- TD4 — a surface deferral's blocker must be the right component ---------
//
// TD1 checks the blocker is *known*, TD3 that its mapped path *exists*, and
// neither can tell a wrong blocker from a pending one — A03 §9a says so, and says
// the general fix is a person reading two specs. That is true of the general case
// and false of one special case, and the special case is where both known
// instances occurred:
//
//   S09 §2   rule, rule, steps, notice, rule, table, notice   named C11 and C12
//   S07 §3   two `diff` blocks; §3 has no illustration at all  named C25
//
// S09 became writable when C11 landed and stayed exempt for a whole component.
// S07 never had a patch region to compose — the surface that draws a patch is
// S10 §4a. When S09's was corrected, HEIGHT_AUDIT recorded that a wrong blocker
// is rarer than a missing one and that this was the first. It was the second
// within one component, which is the standing signal for covering the class.
//
// Two halves, because the two instances failed differently:
//
//   (a) The deferral names a surface *and a section*, and that section contains
//       an illustration. A deferral about composing illustrated rows, pointing at
//       a section with no illustration, is wrong on its face.
//   (b) Where the blocker is a component that registers a block kind, that kind
//       appears in the surface's own stated composition.
//
// Half (b) has no live subject once C25 lands, C25 being the last registrant, and
// that is recorded rather than hidden: its fabricated violation is the whole of
// its evidence, and A03 §2 already names "a rule with nothing to be wrong about"
// as the failure this suite exists to prevent. Half (a) applies to every surface
// deferral there will ever be.

/**
 * The three kinds a component registers rather than C09 shipping (C09 §3). The
 * whole of half (b)'s domain: no fourth kind is registered this way, which is
 * both why the map is three rows and why the half stops having subjects.
 */
export const KIND_OF_COMPONENT = Object.freeze({
  C11: "table",
  C12: "plot",
  C25: "patch",
});

/** `S07 §3`, `S10 §4a`. The section is optional so half (a) can require it. */
const SURFACE_SECTION = /\bS(\d{2})\s*§\s*(\d+[a-z]?)/g;
const SURFACE_ID = /\bS(\d{2})\b/g;

/** A composition stated as a list of kinds: "adapts to rule, table, tip." */
const COMPOSITION = /adapts to ([^.]*)\./gi;

function surfaceSpec(nn, readDir = readdirSync, readFile = (f) => readFileSync(f, "utf8")) {
  const dir = "docs/surfaces";
  const hit = readDir(dir).find((f) => f.startsWith(`S${nn}_`));
  return hit === undefined ? null : { path: `${dir}/${hit}`, src: readFile(`${dir}/${hit}`) };
}

/**
 * Whether a `##`-level section of a markdown document contains a fenced block.
 *
 * Bounded by the next `##` heading, so a fence three sections later does not
 * count — which is the whole point: S07 has fences, and none of them is in §3.
 */
function sectionHasFence(src, section) {
  const lines = src.split("\n");
  const head = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.\\s]`);
  let inside = false;
  for (const line of lines) {
    if (inside && /^##\s/.test(line)) break;
    if (!inside) {
      if (head.test(line)) inside = true;
      continue;
    }
    if (/^```/.test(line)) return true;
  }
  return false;
}

/** Every kind named in any composition line the surface states. */
function statedKinds(src) {
  const kinds = new Set();
  COMPOSITION.lastIndex = 0;
  let m;
  while ((m = COMPOSITION.exec(src))) {
    for (const item of m[1].split(",")) kinds.add(item.trim().toLowerCase());
  }
  return kinds;
}

/**
 * TD4, as a pure function over its inputs so it can be run against fabricated
 * entries and shown to fire (A03 commitment 14).
 */
export function checkSurfaceDeferrals(
  entries,
  kinds = KIND_OF_COMPONENT,
  readDir = readdirSync,
  readFile = (f) => readFileSync(f, "utf8"),
) {
  const violations = [];

  for (const { file, title } of entries) {
    SURFACE_ID.lastIndex = 0;
    const named = new Set([...title.matchAll(SURFACE_ID)].map((m) => m[1]));
    if (named.size === 0) continue;

    const blockers = blockersIn(title) ?? [];

    SURFACE_SECTION.lastIndex = 0;
    const sections = new Map();
    for (const m of title.matchAll(SURFACE_SECTION)) {
      if (!sections.has(m[1])) sections.set(m[1], []);
      sections.get(m[1]).push(m[2]);
    }

    for (const nn of [...named].sort()) {
      const spec = surfaceSpec(nn, readDir, readFile);
      if (spec === null) {
        violations.push({
          rule: "TD4",
          file,
          message:
            `todo names S${nn}, which has no spec in docs/surfaces/ — ` +
            `a deferral about a surface that does not exist never expires`,
          spec: "A03 §9a, TD4",
        });
        continue;
      }

      // (a) — the section, and its illustration.
      const named_sections = sections.get(nn);
      if (named_sections === undefined) {
        violations.push({
          rule: "TD4",
          file,
          message:
            `todo defers S${nn} without naming a section (\`S${nn} §2\`) — ` +
            `an illustration is a section's, so a deferral that names none cannot ` +
            `be checked against one, and S07's named a section that had no ` +
            `illustration at all. Title: ${JSON.stringify(title.slice(0, 90))}`,
          spec: "A03 §9a, TD4",
        });
      } else {
        for (const section of named_sections) {
          if (sectionHasFence(spec.src, section)) continue;
          violations.push({
            rule: "TD4",
            file,
            message:
              `todo defers S${nn} §${section} until its illustration composes, and ` +
              `§${section} of ${spec.path} contains no illustration — there is nothing ` +
              `for the named component to make composable. This is S07 §3 exactly`,
            spec: "A03 §9a, TD4",
          });
        }
      }

      // (b) — the blocker's kind, in the surface's own composition.
      const stated = statedKinds(spec.src);
      for (const id of blockers) {
        const kind = kinds[id];
        if (kind === undefined) continue;
        if (stated.size === 0) {
          violations.push({
            rule: "TD4",
            file,
            message:
              `todo defers S${nn} to ${id}, which registers \`${kind}\`, and ` +
              `${spec.path} states no composition ("adapts to …") to check it ` +
              `against — the claim is unfalsifiable rather than satisfied`,
            spec: "A03 §9a, TD4",
          });
          continue;
        }
        if ([...stated].some((item) => item.includes(kind))) continue;
        violations.push({
          rule: "TD4",
          file,
          message:
            `todo defers S${nn} to ${id}, which registers \`${kind}\`, but S${nn} ` +
            `composes to ${[...stated].join(", ")} — no \`${kind}\`. The blocker is ` +
            `the wrong component, and a wrong blocker is indistinguishable from a ` +
            `pending one until someone reads both specs (A03 §9a)`,
          spec: "A03 §9a, TD4",
        });
      }
    }
  }

  return violations;
}

/** Walk `test/` and collect every `it.todo` title with its file. */
export function collectTodos(dir = "test", readFile = (f) => readFileSync(f, "utf8")) {
  const entries = [];
  const walk = (d) => {
    let names;
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = `${d}/${name}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) {
        for (const title of todoTitles(readFile(p))) entries.push({ file: p, title });
      }
    }
  };
  walk(dir);
  return entries;
}
