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
