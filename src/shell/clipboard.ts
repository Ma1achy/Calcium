/**
 * Where a copy goes, and what it says about it (C14 I61, ruling 72).
 *
 * The person's order: **the kill buffer, then OSC 52, then a platform tool** —
 * and the kill buffer is the caller's, written before this is reached (C17
 * I31). **A file is never a route** (corrected 2026-09-29): it is offered where
 * no route takes the text, and written only by `save`, which is the reader
 * taking the offer (§6e's classification table). C01 builds the bytes, C02 says the terminal takes them and
 * C21 finds and runs the tool; each answers for its own layer, and the order
 * between them is L4's because L4 is the only layer that sees both halves of L0
 * and the only one with a scheduler (C21 W18).
 *
 * Two pieces, split where the clock is:
 *
 *   - `routeCopy` and `copyToast` are pure — which mechanism, and the sentence
 *     for each outcome. The wording is the ruling's substance: OSC 52 is
 *     *sent*, because nothing comes back; only a tool's exit `0` is *copied*.
 *   - `createCopier` holds the one pending copy, its deadline and its
 *     generation (§6e *Where the copy goes*, rows 4–10), so a late answer and
 *     a superseded one say nothing — and the latest copy's failure, which is
 *     what the offer for that copy reads (K7–K11).
 */

import { isAbsolute, join } from "node:path";

import { clipboardWrite } from "../terminal/escapes.js";
import type { ClipboardTool, ClipboardWrite } from "../data/process/clipboard.js";

/**
 * How long a tool has to answer before the copy is said to have failed (§6e row 7).
 *
 * **2 000 ms and unmeasured.** A tool that answers at all answers in
 * milliseconds; the figure bounds how long `copying with <tool>` stays up over a
 * tool that never will, and C21 has no timer to bound it (I8).
 */
export const COPY_DEADLINE_MS = 2_000;

/**
 * The file the offer writes — replaced, not appended — **as an absolute path**
 * (§6e K16). The default `stateDir` is `.calcium`, relative, and the toast
 * states the full path, so it is resolved against the session's working
 * directory here rather than left for the reader to guess.
 */
export const copyFilePath = (stateDir: string, cwd: string): string =>
  isAbsolute(stateDir) ? join(stateDir, "copy.txt") : join(cwd, stateDir, "copy.txt");

/** Which mechanism, decided before anything is written (C21 W1–W4). */
export type CopyRoute =
  | Readonly<{ kind: "osc52"; bytes: string }>
  | Readonly<{ kind: "tool"; tool: ClipboardTool }>
  | Readonly<{ kind: "none"; why: "no-clipboard" | "too-large" }>;

/**
 * The person's order over what the layers below hand up.
 *
 * **A `null` from `clipboardWrite` declines one mechanism, not the copy** (C21
 * W2): past the cap the order goes on to the tool, and only with no tool is the
 * reason *too large* rather than *no clipboard* (W3). The empty text never
 * arrives — C14 I59 toasts it before a copy is attempted. `none` writes
 * nothing: it is what the offer is drawn from (K3, K13).
 */
export function routeCopy(text: string, clipboard: "none" | "osc52", tool: ClipboardTool | null): CopyRoute {
  const bytes = clipboard === "osc52" ? clipboardWrite(text) : null;
  if (bytes !== null) return Object.freeze({ kind: "osc52", bytes });
  if (tool !== null) return Object.freeze({ kind: "tool", tool });
  return Object.freeze({ kind: "none", why: clipboard === "osc52" ? "too-large" : "no-clipboard" });
}

/** Why no route took a copy — the offer's reason, and the toast's (K3, K7, K8, K13). */
export type NoRoute =
  | Readonly<{ kind: "no-clipboard" }>
  | Readonly<{ kind: "too-large" }>
  | Readonly<{ kind: "failed"; tool: string; reason: string }>
  | Readonly<{ kind: "silent"; tool: string }>;

/** The footer's fact for an offer, last of the facts (C14 §6e's footer table). */
export function offerFact(why: NoRoute): string {
  switch (why.kind) {
    case "no-clipboard":
      return "no clipboard";
    case "too-large":
      return "too large for the terminal";
    case "failed":
      return `${why.tool} failed`;
    case "silent":
      return `${why.tool} did not answer`;
  }
}

/** What happened to one copy, in the terms its sentence needs. */
export type CopyOutcome =
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "pending"; tool: string }>
  | Readonly<{ kind: "copied"; tool: string }>
  | Readonly<{ kind: "unrouted"; why: NoRoute }>
  | Readonly<{ kind: "saved"; path: string; written: boolean }>;

/**
 * The toast for an outcome (§6e rows 2–13, K1–K16).
 *
 * **`copied` is said once, for the one outcome a process on the reader's
 * machine reported** — a tool's exit `0`, in the person's form `copied via
 * <tool>`. OSC 52 is `sent`, never `copied` (ruling 72). A copy no route took
 * says why and where the text is — the kill buffer, which C17 I31 makes true —
 * and never *saved*: only the offer taken writes, and it names the absolute
 * path.
 */
export function copyToast(outcome: CopyOutcome): string {
  switch (outcome.kind) {
    case "sent":
      return "sent to the terminal's clipboard";
    case "pending":
      return `copying with ${outcome.tool}`;
    case "copied":
      return `copied via ${outcome.tool}`;
    case "saved":
      return outcome.written ? `saved to ${outcome.path}` : `${outcome.path} could not be written — ${HELD}`;
    case "unrouted": {
      const why = outcome.why;
      switch (why.kind) {
        case "no-clipboard":
          return `no clipboard here — ${HELD}`;
        case "too-large":
          return `too large for the terminal's clipboard — ${HELD}`;
        case "failed":
          return `${why.tool} failed (${why.reason}) — ${HELD}`;
        case "silent":
          return `${why.tool} did not answer — ${HELD}`;
      }
    }
  }
}

/** Where the text is when no route took it (C17 I31: the kill buffer, first, always). */
const HELD = "the kill buffer holds it";

export type CopierDeps = Readonly<{
  clipboard: "none" | "osc52";
  tool: ClipboardTool | null;
  /** The OSC 52 bytes, onto the terminal's writer. */
  send: (bytes: string) => void;
  write: (tool: ClipboardTool, text: string) => Promise<ClipboardWrite>;
  writeFile: (path: string, text: string) => Promise<void>;
  path: string;
  schedule: (fn: () => void, ms: number) => Disposable;
  /** Every sentence this copier says — the session's toast. */
  say: (text: string) => void;
}>;

export type Copier = Readonly<{
  /**
   * Why the file is offered for this text, or `null` where a route takes it
   * (§6e K1–K16) — the footer's `⏎ to file` and `⏎`'s meaning, from one call.
   *
   * **The text is a thunk** because the commonest answers never need it: no
   * route at all is a property of the session, and a tool with no failure
   * standing answers `null` without it. The copy text is the most expensive
   * thing the footer could ask for (a rectangle renders its entry).
   */
  fileOffer: (text: () => string) => NoRoute | null;
  copy: (text: string) => void;
  /** The offer taken: the one thing that writes the file (K4, K9, K14, K15). */
  save: (text: string) => void;
  [Symbol.dispose]: () => void;
}>;

/**
 * One pending copy at a time, and each copy speaks once (§6e rows 7–10).
 *
 * **The generation is the whole of row 9**: C21 resolves each write on its own
 * exit and is right to, so two copies' answers arrive in an order nothing
 * controls. Every continuation checks it is still the latest copy before it
 * speaks, and a new copy disposes the old one's deadline.
 */
export function createCopier(deps: CopierDeps): Copier {
  let generation = 0;
  let deadline: Disposable | null = null;
  /**
   * **The latest copy, if its tool did not take it** (K7, K8). Cleared by the
   * next copy or save, so the offer is for *that* copy: a later copy of any text
   * withdraws it (K11), and a different selection does not match it (K10).
   */
  let failed: Readonly<{ text: string; why: NoRoute }> | null = null;

  const disarm = (): void => {
    deadline?.[Symbol.dispose]();
    deadline = null;
  };

  /** A tool that did not take this copy: said, and offered — never written (K7, K8). */
  const unrouted = (text: string, why: NoRoute): void => {
    failed = Object.freeze({ text, why });
    deps.say(copyToast({ kind: "unrouted", why }));
  };

  const begin = (): number => {
    disarm();
    generation += 1;
    failed = null;
    return generation;
  };

  return Object.freeze({
    fileOffer(text: () => string): NoRoute | null {
      if (deps.clipboard === "none" && deps.tool === null) return Object.freeze({ kind: "no-clipboard" });
      if (failed !== null && failed.text === text()) return failed.why;
      if (deps.tool !== null) return null;
      // Past the cap (K3). **Not the empty text**, which `clipboardWrite` also
      // declines (C21 W1) and which C14 I59 says before any copy is attempted.
      const t = text();
      if (t !== "" && clipboardWrite(t) === null) return Object.freeze({ kind: "too-large" });
      return null;
    },
    copy(text: string): void {
      const mine = begin();
      const route = routeCopy(text, deps.clipboard, deps.tool);
      switch (route.kind) {
        case "osc52":
          // **Done, not failed** (K1): nothing comes back, so nothing is offered.
          deps.send(route.bytes);
          deps.say(copyToast({ kind: "sent" }));
          return;
        case "none":
          // **Said, not written** (K13, trace rows 11a and 13): the offer was
          // already on the footer, and it is `⏎`'s to take.
          deps.say(copyToast({ kind: "unrouted", why: Object.freeze({ kind: route.why }) }));
          return;
        case "tool": {
          const name = route.tool.name;
          deps.say(copyToast({ kind: "pending", tool: name }));
          let settled = false;
          deadline = deps.schedule(() => {
            deadline = null;
            if (settled || mine !== generation) return;
            settled = true;
            unrouted(text, Object.freeze({ kind: "silent", tool: name }));
          }, COPY_DEADLINE_MS);
          void deps.write(route.tool, text).then((answer) => {
            if (settled || mine !== generation) return;
            settled = true;
            disarm();
            if (answer.ok) deps.say(copyToast({ kind: "copied", tool: name }));
            else unrouted(text, Object.freeze({ kind: "failed", tool: name, reason: answer.reason }));
          });
          return;
        }
      }
    },
    save(text: string): void {
      const mine = begin();
      const done = (written: boolean): void => {
        if (mine !== generation) return;
        deps.say(copyToast({ kind: "saved", path: deps.path, written }));
      };
      deps.writeFile(deps.path, text).then(
        () => done(true),
        () => done(false),
      );
    },
    [Symbol.dispose](): void {
      disarm();
      generation += 1;
      failed = null;
    },
  });
}
