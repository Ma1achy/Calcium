/**
 * Gate 1's answer — CLI usage, for a stdout that is not a terminal.
 *
 * C22 §4 step 1, I37. **Not `/help`**: that renders keybindings from the keymap
 * (C23 I26) — `↑↓ rows`, `⏎ drill in`, `esc prompt` — which is the right answer
 * for someone at a prompt and the wrong register entirely for `prism | cat`,
 * where there is no prompt and no keyboard.
 *
 * Its own file rather than a string in `session.ts`, so that SS1's allow-list
 * (the composition root, and the ambient reads it is allowed) stays about the
 * ambient reads. Nothing here touches the environment.
 */

/** The whole gate-1 output, as one string ending in a newline. */
export function usageText(name: string, binary: string): string {
  // Plain ASCII and no escapes at all. This is written to a pipe by definition,
  // and the one thing the gate exists to prevent is a byte a pipe cannot read
  // (I36). No colour, because C10 resolves against a capability record and there
  // is no terminal to have one.
  return (
    `${name} — a terminal interface for ${binary}\n` +
    `\n` +
    `Usage: ${binary} [command]        run ${binary} directly\n` +
    `       ${name}                    open the interactive shell\n` +
    `\n` +
    `${name} needs a terminal: stdout is not a TTY, so there is nothing to draw\n` +
    `on. Run it without a pipe or a redirect, or call ${binary} directly and\n` +
    `handle its output yourself.\n`
  );
}
