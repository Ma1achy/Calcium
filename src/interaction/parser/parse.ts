/**
 * Tokenise, classify, expand, validate. Pure and total.
 *
 * C18 — see spec. `parse` never throws (I1) and stores nothing (I2): the last
 * UUID, the manifest and the binary all arrive as context, which is what makes
 * every rule in §4 testable as a table of strings.
 */

import { findTool, validateInvocation } from "../../data/manifest/index.js";
import { suggestName } from "../../data/manifest/index.js";
import type { ErrorLike } from "../../data/viewmodel/types.js";

import { classify } from "./classify.js";
import { delegated } from "./delegate.js";
import { expand, needsExpansion } from "./expand.js";
import { slashPolicy } from "./policy.js";
import { tokenise } from "./tokenise.js";
import { TTY_MARKER } from "./types.js";
import type { ParseContext, ParseResult, Token } from "./types.js";

/**
 * A NUL never reaches a shell or a verb (T3.17). Stripped rather than refused:
 * it arrives from a paste far more often than from a person, and the rest of
 * the line is what they meant.
 */
function sanitise(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u0000/gu, "");
}

function fail(error: ErrorLike): ParseResult {
  return Object.freeze({ kind: "error" as const, error });
}

function err(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  remediation?: string,
): ErrorLike {
  return Object.freeze({
    message,
    code,
    stage: "parse",
    ...(details === undefined ? {} : { details: Object.freeze(details) }),
    ...(remediation === undefined ? {} : { remediation }),
  });
}

export function parse(input: string, ctx: ParseContext): ParseResult {
  const policy = ctx.policy ?? slashPolicy;
  const source = sanitise(input);

  const tokenised = tokenise(source);
  if (!tokenised.ok) return fail(tokenised.error);

  const tokens = tokenised.value;
  const shape = classify(tokens, (t) => policy.verbOf(t));

  switch (shape.rule) {
    case 0:
      return fail(
        shape.refusal === "background"
          ? err(
              "background_refused",
              "a trailing & is refused: a background job has nowhere to report to",
              { word: shape.word },
              "run it in the foreground, or start it from a shell outside the TUI",
            )
          : err(
              "job_control_refused",
              `${shape.word} needs a job table, and there is none`,
              { word: shape.word },
              "there is one command at a time here; Ctrl-C cancels it",
            ),
      );

    case 1:
      return Object.freeze({ kind: "empty" as const });

    case "1a": {
      // §5a — a tool named `tty` makes `/tty vim` mean two things, and C18 is
      // the only component that can see both records: it holds the manifest and
      // the policy. C05 cannot hold the rule — it is L0 `data/` and the marker
      // is L3's — so it is reported here rather than reserved there.
      if (findTool(ctx.manifest, [TTY_MARKER]) !== null) {
        return fail(
          err(
            "tty_marker_shadowed",
            `${policy.prefix}${TTY_MARKER} is declared as a verb and is also the handoff marker`,
            { verb: TTY_MARKER },
            `rename the verb — the marker cannot move, since it is what strips itself from the line`,
          ),
        );
      }
      return Object.freeze({
        kind: "shell" as const,
        // **Stripped, always** (I26). `from` is the next token's start, so the
        // marker is not in the delegated string on any route — `sh` would take
        // it as an argument.
        command: delegated(source, tokens, policy, ctx.binary, shape.restFrom),
        interactive: true,
      });
    }

    case "1aEmpty":
      return fail(
        err(
          "tty_marker_bare",
          `${policy.prefix}${TTY_MARKER} needs a command to run`,
          { prefix: policy.prefix },
          `${policy.prefix}${TTY_MARKER} vim, ${policy.prefix}${TTY_MARKER} less README.md`,
        ),
      );

    case "1aBuiltin":
      // I27 — and the built-in is **not** returned for L4 to apply. Refusing is
      // only meaningful if neither half happens.
      return fail(
        err(
          "tty_marker_builtin",
          `${shape.name} changes this session's own state and cannot run under ` +
            `${policy.prefix}${TTY_MARKER}`,
          { builtin: shape.name },
          `${shape.name} on its own, or drop the ${policy.prefix}${TTY_MARKER}`,
        ),
      );

    case "2a":
      return Object.freeze({
        kind: "builtin" as const,
        name: shape.name,
        args: Object.freeze(shape.args.map((t) => t.text)),
      });

    case "2b":
      return Object.freeze({
        kind: "builtinThenShell" as const,
        name: shape.name,
        args: Object.freeze(shape.args.map((t) => t.text)),
        // The remainder is delegated, and delegation means the rewrite (§4):
        // `cd /tmp && /ps` must run the app rather than a path.
        rest: delegated(source, tokens, policy, ctx.binary, shape.restFrom),
      });

    case "2c":
    case 3:
    case 5:
      return Object.freeze({
        kind: "shell" as const,
        command: delegated(source, tokens, policy, ctx.binary),
        interactive: false,
      });

    case 4:
      return app(source, shape.verb, shape.rest, ctx, policy.prefix);
  }
}

function app(
  _source: string,
  verbToken: Token,
  rest: readonly Token[],
  ctx: ParseContext,
  prefix: string,
): ParseResult {
  const verb = (ctx.policy ?? slashPolicy).verbOf(verbToken) as string;

  // §6: `/` alone is its own error. The suggester on `""` answers with every
  // one- and two-character verb there is, which is a worse message than none.
  if (verb === "") {
    return fail(
      err("no_verb", `${prefix} on its own names no verb`, { prefix }, `${prefix}help lists them`),
    );
  }

  // **Lookup precedes expansion** (I21). `$_` never appears in a verb, the verb
  // is the thing the user got wrong, and the cheaper message is the useful one.
  const tokens = [verb, ...rest.map((t) => t.text)];
  const match = findTool(ctx.manifest, tokens);

  if (match === null) {
    const hint = suggestName(
      verb,
      ctx.manifest.tools.map((t) => t.name),
    );
    return fail(
      err(
        "unknown_verb",
        hint === undefined
          ? `unknown verb: ${prefix}${verb}`
          : `unknown verb: ${prefix}${verb} — did you mean ${prefix}${hint}?`,
        { verb, ...(hint === undefined ? {} : { suggestion: hint }) },
        hint === undefined ? `${prefix}help lists the verbs` : undefined,
      ),
    );
  }

  // Expansion, now that the verb resolved (I8: after tokenising, always).
  const expanded: string[] = [];
  for (const token of rest) {
    if (!needsExpansion(token)) {
      expanded.push(token.text);
      continue;
    }
    if (ctx.lastUuid === null) {
      return fail(
        err(
          "no_previous_result",
          "no previous result · submit or promote something first",
          { token: token.text },
        ),
      );
    }
    expanded.push(expand(token, ctx.lastUuid));
  }

  // `consumed` counts the verb tokens the match ate, and the first of them is
  // the prefixed one — so the residual is what follows within `expanded`.
  const residual = Object.freeze(expanded.slice(match.consumed - 1));
  const argv = Object.freeze([...match.tool.name.split(" "), ...residual]);

  // I19: validated once, over exactly the array carried on the result.
  const validation = validateInvocation(match.tool, residual);

  return Object.freeze({
    kind: match.tool.local ? ("local" as const) : ("app" as const),
    tool: match.tool,
    argv,
    residual,
    validation,
  });
}
