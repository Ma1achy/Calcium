/**
 * C23 §2's `LocalRegistry`, and the reconciliation `seal()` performs (C23 I27).
 *
 * **The registry is one of two records of the same fact**, and until C23 §8b B3
 * nothing compared them. C18 classifies a verb as `local` from the **manifest**;
 * the handler that runs it lives **here**. So a manifest verb marked local with
 * no registered handler reaches §2's *run an in-process handler* with nothing to
 * run, and a handler registered for no manifest verb sits unreachable while
 * looking installed.
 *
 * `seal()` is the moment to compare because it is the only moment both sides are
 * complete: Calcium's own handlers and the app's are all registered, the
 * manifest is loaded and sealed (C22 I3), and input has not been accepted. It is
 * SP4's class at runtime — two records, no comparison — closed at the one point
 * where the answer is cheap and a mismatch is still a configuration error rather
 * than a missing command at the prompt.
 */

import type { Manifest } from "../../data/manifest/index.js";
import type { Block, LocalDocument } from "../../data/viewmodel/index.js";
import type { ProducerContext } from "../../data/adapters/types.js";

export type Choice = Readonly<{ key: string; label: string; default?: true }>;

/**
 * C23 §2's question — a choice list, never a yes/no box.
 *
 * The two-choice case is the degenerate one, and ruling it general costs a field:
 * the second consumer needs single-select and free text and would otherwise get a
 * second mechanism.
 */
export type AskOptions = Readonly<{
  question: string;
  /** What the answer will affect — a dry-run, or the matching `ls`. */
  detail?: Block;
  choices: readonly Choice[];
  /**
   * Where the question sits; `centred` by default (roadmap entry 16 A6).
   *
   * **A choice between placements rather than a `Placement`**, and that is the
   * shape rather than a simplification. C15's `anchored` carries `row` and
   * `rows` — the prompt's own extent, which the session computes and a local
   * handler cannot know — so a field of that type would be public and half
   * unfillable. The two arms are the decision a caller can actually make; L4
   * supplies the anchor for the second.
   *
   * The width is not derived from this in general (entry 16 A3: the completion
   * menu declares none and reverse search declares one, both anchored). It is
   * derived here, by the layer's own owner, which is what A3 says the decision
   * is.
   */
  placement?: "centred" | "anchored";
}>;

/**
 * C23 §2 — the producer context (C07 §3), plus the local route's own `ask`.
 *
 * **The context is obligatory at registration** (C23 I39). A parameter type may
 * always be wider, so a handler declaring `{ command: string }` compiles, runs,
 * and can never see a field added here — measured at four of the reference app's
 * eight families. `TuiConfig.localHandlers` refuses the declaration;
 * `ExactLocalHandlers` in `shell/types.ts` is the mechanism.
 */
export type LocalContext = ProducerContext & Readonly<{
  /** As typed, for `doc.command`. */
  command: string;
  /**
   * Ask, and await the answer (C23 I36).
   *
   * **Resolves with a choice on every path and never with null.** Declining is
   * the choice marked `default`, and `Esc` and `⌃c` resolve with it too — so
   * there is no second representation of *nothing happened* for a caller to
   * handle and no path by which it could tell the two apart if there were.
   */
  ask: (opts: AskOptions) => Promise<string>;
  /**
   * What C05 parsed out of this invocation (C22 I66, C05 §4).
   *
   * **A widening that closes a duplication rather than adding a field.** A
   * handler receives `argv` with the shell's own switches stripped, so a
   * `shellOnly` flag is invisible to it and its only other surface is
   * `command` — the line *as typed*. Reading a flag from there is a second
   * parser, which is exactly what `ValidationResult.transmitted` exists to
   * prevent: the walk that knows where a flag ends is C05's, and a copy of
   * those rules drifts from it.
   *
   * `/theme` is the measured case, and it was re-deriving `dark|light` from
   * `argv[0]` although validation had already parsed **and enum-checked** it.
   *
   * **Empty when validation failed**, because a local verb is not gated on it
   * (C23 I38 gates the app route alone) — a handler that answers a malformed
   * invocation with its own usage notice is reached with nothing parsed, and
   * that is the arm the notice exists for.
   */
  args: Readonly<Record<string, unknown>>;
}>;

export type LocalHandler = (
  argv: readonly string[],
  ctx: LocalContext,
) => LocalDocument | Promise<LocalDocument>;

export interface LocalRegistry {
  register(verb: string, handler: LocalHandler): void;
  seal(): void;
  readonly sealed: boolean;
  get(verb: string): LocalHandler | undefined;
  readonly verbs: readonly string[];
}

/** Thrown by `seal()` for C23 I27, naming both directions separately. */
export class LocalRegistryError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(`local handlers do not match the manifest:\n  ${reasons.join("\n  ")}`);
    this.name = "LocalRegistryError";
  }
}

/**
 * Which verbs the manifest says are local.
 *
 * Exported because the reconciliation is the interesting half and a test that
 * derives its expectation from the same walk agrees with itself (C05 T1.7c).
 */
export function localVerbsOf(manifest: Manifest): readonly string[] {
  return manifest.tools.filter((t) => t.local === true).map((t) => t.name);
}

export function createLocalRegistry(): LocalRegistry {
  const handlers = new Map<string, LocalHandler>();
  let sealed = false;

  return {
    register(verb, handler) {
      // Sealing is what makes the reconciliation meaningful; a registration
      // after it would mean the check ran against a set that later changed.
      if (sealed) throw new LocalRegistryError([`\`${verb}\` registered after seal()`]);
      handlers.set(verb, handler);
    },

    seal() {
      sealed = true;
    },

    get sealed() {
      return sealed;
    },

    get(verb) {
      return handlers.get(verb);
    },

    get verbs() {
      return [...handlers.keys()].sort();
    },
  };
}

/**
 * C23 I27 — both directions, and the count is not the assertion.
 *
 * Returns the reasons rather than throwing, so the caller decides whether a
 * mismatch fails construction (it does) and so a test can read them without
 * catching. Each direction is reported separately because they are different
 * mistakes with different fixes: a missing handler is an app that forgot to
 * register, an extra one is an app that registered a verb its manifest does not
 * declare — and reporting "3 mismatches" would make them look like one problem.
 */
export function reconcile(
  registry: LocalRegistry,
  manifest: Manifest,
): readonly string[] {
  const declared = new Set(localVerbsOf(manifest));
  const registered = new Set(registry.verbs);
  const reasons: string[] = [];

  for (const verb of [...declared].sort()) {
    if (!registered.has(verb)) {
      reasons.push(
        `\`${verb}\` is marked local in the manifest and has no handler — ` +
          `it would classify as \`local\` and reach the pipeline with nothing to run`,
      );
    }
  }
  for (const verb of [...registered].sort()) {
    if (!declared.has(verb)) {
      reasons.push(
        `\`${verb}\` has a handler and is not a local verb in the manifest — ` +
          `nothing will ever classify to it, so it looks installed and is unreachable`,
      );
    }
  }

  return reasons;
}
