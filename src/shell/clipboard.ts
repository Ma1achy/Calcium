/**
 * Where a copy goes, and what it says about it (C14 I61, ruling 72).
 *
 * The person's order: **the kill buffer, then OSC 52, then a platform tool,
 * then a file** — and the kill buffer is the caller's, written before this is
 * reached (C17 I31). C01 builds the bytes, C02 says the terminal takes them and
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
 *     a superseded one say nothing.
 */

import { clipboardWrite } from "../terminal/escapes.js";
import type { ClipboardTool, ClipboardWrite } from "../data/process/clipboard.js";

/**
 * How long a tool has to answer before the copy goes to a file (§6e row 7).
 *
 * **2 000 ms and unmeasured.** A tool that answers at all answers in
 * milliseconds; the figure bounds how long `copying with <tool>` stays up over a
 * tool that never will, and C21 has no timer to bound it (I8).
 */
export const COPY_DEADLINE_MS = 2_000;

/** The file a copy lands in when no clipboard takes it — replaced, not appended. */
export const copyFilePath = (stateDir: string): string => `${stateDir}/copy.txt`;

/** Which mechanism, decided before anything is written (C21 W1–W4). */
export type CopyRoute =
  | Readonly<{ kind: "osc52"; bytes: string }>
  | Readonly<{ kind: "tool"; tool: ClipboardTool }>
  | Readonly<{ kind: "file"; why: "no-clipboard" | "too-large" }>;

/**
 * The person's order over what the layers below hand up.
 *
 * **A `null` from `clipboardWrite` declines one mechanism, not the copy** (C21
 * W2): past the cap the order goes on to the tool, and only with no tool is the
 * reason *too large* rather than *no clipboard* (W3). The empty text never
 * arrives — C14 I59 toasts it before a copy is attempted.
 */
export function routeCopy(text: string, clipboard: "none" | "osc52", tool: ClipboardTool | null): CopyRoute {
  const bytes = clipboard === "osc52" ? clipboardWrite(text) : null;
  if (bytes !== null) return Object.freeze({ kind: "osc52", bytes });
  if (tool !== null) return Object.freeze({ kind: "tool", tool });
  return Object.freeze({ kind: "file", why: clipboard === "osc52" ? "too-large" : "no-clipboard" });
}

/** What happened to one copy, in the terms its sentence needs. */
export type CopyOutcome =
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "pending"; tool: string }>
  | Readonly<{ kind: "copied"; tool: string }>
  | Readonly<{
      kind: "file";
      path: string;
      why:
        | Readonly<{ kind: "no-clipboard" }>
        | Readonly<{ kind: "too-large" }>
        | Readonly<{ kind: "failed"; tool: string; reason: string }>
        | Readonly<{ kind: "silent"; tool: string }>;
      written: boolean;
    }>;

/**
 * The toast for an outcome (§6e rows 2–13).
 *
 * **`copied` is said once, for the one outcome a process on the reader's
 * machine reported** — a tool's exit `0`. OSC 52 is `sent`, never `copied`
 * (ruling 72). A file names its path, and a file that could not be written
 * says where the text still is, which C17 I31 makes true.
 */
export function copyToast(outcome: CopyOutcome): string {
  switch (outcome.kind) {
    case "sent":
      return "sent to the terminal's clipboard";
    case "pending":
      return `copying with ${outcome.tool}`;
    case "copied":
      return `copied to the clipboard by ${outcome.tool}`;
    case "file": {
      if (!outcome.written) return `no clipboard, and ${outcome.path} could not be written — the kill buffer holds it`;
      const where = `saved to ${outcome.path}`;
      switch (outcome.why.kind) {
        case "no-clipboard":
          return `no clipboard here — ${where}`;
        case "too-large":
          return `too large for the terminal's clipboard — ${where}`;
        case "failed":
          return `${outcome.why.tool} failed (${outcome.why.reason}) — ${where}`;
        case "silent":
          return `${outcome.why.tool} did not answer — ${where}`;
      }
    }
  }
}

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
  /** `false` where no mechanism exists at rest — the footer's `no clipboard` (§6e table). */
  hasClipboard: boolean;
  copy: (text: string) => void;
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

  const disarm = (): void => {
    deadline?.[Symbol.dispose]();
    deadline = null;
  };

  const toFile = (mine: number, text: string, why: Extract<CopyOutcome, { kind: "file" }>["why"]): void => {
    const done = (written: boolean): void => {
      if (mine !== generation) return;
      deps.say(copyToast({ kind: "file", path: deps.path, why, written }));
    };
    deps.writeFile(deps.path, text).then(
      () => done(true),
      () => done(false),
    );
  };

  return Object.freeze({
    hasClipboard: deps.clipboard === "osc52" || deps.tool !== null,
    copy(text: string): void {
      disarm();
      generation += 1;
      const mine = generation;
      const route = routeCopy(text, deps.clipboard, deps.tool);
      switch (route.kind) {
        case "osc52":
          deps.send(route.bytes);
          deps.say(copyToast({ kind: "sent" }));
          return;
        case "file":
          toFile(mine, text, Object.freeze({ kind: route.why }));
          return;
        case "tool": {
          const name = route.tool.name;
          deps.say(copyToast({ kind: "pending", tool: name }));
          let settled = false;
          deadline = deps.schedule(() => {
            deadline = null;
            if (settled || mine !== generation) return;
            settled = true;
            toFile(mine, text, Object.freeze({ kind: "silent", tool: name }));
          }, COPY_DEADLINE_MS);
          void deps.write(route.tool, text).then((answer) => {
            if (settled || mine !== generation) return;
            settled = true;
            disarm();
            if (answer.ok) deps.say(copyToast({ kind: "copied", tool: name }));
            else toFile(mine, text, Object.freeze({ kind: "failed", tool: name, reason: answer.reason }));
          });
          return;
        }
      }
    },
    [Symbol.dispose](): void {
      disarm();
      generation += 1;
    },
  });
}
