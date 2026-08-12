/**
 * The destructive family. Step 9's confirm plus Ruling C's weight.
 *
 * ## The far side, measured first
 *
 * | | |
 * |---|---|
 * | `rm` on a running container | **exit 1**, and the message names the fix |
 * | `rm --force` | exit 0, echoes the name |
 * | `rmi` a **non-last** tag of an in-use image | **exit 0**, `Untagged: …` |
 * | `rmi` the **last** tag of an in-use image | **exit 1**, `conflict: … must be forced` |
 * | any `prune` | **no `--dry-run` exists** — only `--filter` and `--force` |
 *
 * The third and fourth rows amended FINDINGS F66, which had measured only the
 * untag case and concluded that `rmi` does not refuse. It refuses when the tag is
 * the image's last reference, and the probe that established otherwise had
 * tagged the image twice — the one variable it never varied.
 *
 * The fifth row is why every prune verb here is two calls. Ruling C wants the
 * question to carry what it will destroy, and with no dry-run the only honest
 * source is the list docker itself walks.
 *
 * ## The refusal is passed through, and the fix is offered
 *
 * `docker rm` on a running container says *stop the container before removing or
 * force remove*. That is better than anything this app would write, so it is
 * shown verbatim and a `tip` carries the `fill` action — B03's canonical path,
 * and the first `fill` this application has produced. `fill` rather than `exec`
 * deliberately: `--force` on a running container is the user's decision to take
 * at a prompt they can still edit, not a button that removes it.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { LocalDocument, Block, LocalContext, ViewDocument } from "@fmx/calcium";
import type { Runner } from "./mutation.ts";
import { inspectState } from "./mutation.ts";

const run = promisify(execFile);
const realRunner: Runner = async (args) => await run("docker", [...args], { maxBuffer: 8 << 20 });

const okDoc = (command: string, argv: readonly string[], blocks: readonly Block[]): LocalDocument => ({
  schema: "tui.view/1",
  meta: { adapter: "destructive" },
  command,
  status: "ok",
  blocks,
});

const errorDoc = (
  command: string,
  argv: readonly string[],
  message: string,
  extra: readonly Block[] = [],
): LocalDocument => ({
  schema: "tui.view/1",
  command,
  status: "error",
  error: { message, stage: "local" },
  blocks: [b.notice.error(message), ...extra],
  meta: { adapter: "destructive" },
});

const stderrOf = (cause: unknown): string =>
  String((cause as { stderr?: string }).stderr ?? cause).trim();

// ── rm / rmi ────────────────────────────────────────────────────────────────

export function createRmHandler(
  runner: Runner = realRunner,
): (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  return async (args, ctx) => {
    const ref = args[0];
    if (ref === undefined || ref === "") {
      return errorDoc(ctx.command, ["rm"], "usage: /rm <container>");
    }
    const force = args.includes("--force") || args.includes("-f");
    const state = await inspectState(runner, ref);
    if (state === null) return errorDoc(ctx.command, ["rm", ref], `no such container: ${ref}`);

    if (!force) {
      const answer = await ctx.ask({
        question: `Remove ${state.name}? This cannot be undone.`,
        detail: b.kv({ container: state.name, image: state.image, state: state.status }),
        choices: [
          { key: "y", label: "yes" },
          { key: "n", label: "no", default: true },
        ],
      });
      if (answer !== "y") {
        return okDoc(ctx.command, ["rm", ref], [b.notice.warn(`not removed — ${state.name} is unchanged`)]);
      }
    }

    const argv = force ? ["rm", "--force", ref] : ["rm", ref];
    try {
      await runner(argv);
    } catch (cause) {
      const said = stderrOf(cause);
      // **Verbatim, plus the fix as a `fill`.** docker's own sentence names the
      // remedy better than a rewrite would, and the suggestion goes to the
      // prompt rather than running — removing a running container is a decision,
      // not a button.
      //
      // **The tip's text is the command, and the frame is why.** It read
      // `Remove it anyway, stopping it first:   Use` — prose plus a bare label,
      // with the thing it would insert nowhere on screen. C09 renders a `fill`
      // as its label alone, so the command has to be in the text or it is
      // invisible; `mapping.ts`'s own remediation does exactly this and the
      // pattern was there to copy.
      const suggestion = /is running/u.test(said)
        ? [b.tip(`/rm ${ref} --force`, [b.fill("Use", `/rm ${ref} --force`)])]
        : [];
      return errorDoc(ctx.command, argv, said || `could not remove ${state.name}`, suggestion);
    }
    return okDoc(ctx.command, argv, [b.notice.ok(`${state.name} removed`)]);
  };
}

export function createRmiHandler(
  runner: Runner = realRunner,
): (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  return async (args, ctx) => {
    const ref = args[0];
    if (ref === undefined || ref === "") {
      return errorDoc(ctx.command, ["rmi"], "usage: /rmi <image>");
    }
    const force = args.includes("--force") || args.includes("-f");

    if (!force) {
      const answer = await ctx.ask({
        question: `Remove image ${ref}?`,
        detail: b.kv({ image: ref }),
        choices: [
          { key: "y", label: "yes" },
          { key: "n", label: "no", default: true },
        ],
      });
      if (answer !== "y") {
        return okDoc(ctx.command, ["rmi", ref], [b.notice.warn(`not removed — ${ref} is unchanged`)]);
      }
    }

    const argv = force ? ["rmi", "--force", ref] : ["rmi", ref];
    try {
      const { stdout } = await runner(argv);
      // **`Untagged:` and `Deleted:` are different outcomes and docker reports
      // both on exit 0.** Removing a non-last tag untags and leaves the blob, so
      // saying "removed" would be a claim the daemon did not make.
      const untagged = /Untagged:/u.test(stdout) && !/Deleted:/u.test(stdout);
      return okDoc(ctx.command, argv, [
        untagged
          ? b.notice.ok(`${ref} untagged — the image is still referenced, so its layers remain`)
          : b.notice.ok(`${ref} removed`),
      ]);
    } catch (cause) {
      const said = stderrOf(cause);
      const suggestion = /must be forced/u.test(said)
        ? [b.tip(`/rmi ${ref} --force`, [b.fill("Use", `/rmi ${ref} --force`)])]
        : [];
      return errorDoc(ctx.command, argv, said || `could not remove ${ref}`, suggestion);
    }
  };
}

// ── the prune family ────────────────────────────────────────────────────────

type PruneKind = "prune" | "volume prune" | "network prune" | "system prune";

/**
 * What each prune would take, and the `ls` that answers it.
 *
 * `system prune` has no single list — it is the union of the other three — so it
 * asks each and labels the rows. That is more honest than `docker system df`,
 * whose reclaimable figure includes build cache the verb does not touch without
 * `--all`.
 */
const LISTS: Readonly<Record<PruneKind, readonly (readonly string[])[]>> = {
  prune: [["ps", "-a", "--filter", "status=exited", "--filter", "status=created", "--format", "{{.Names}}\t{{.Status}}"]],
  "volume prune": [["volume", "ls", "-f", "dangling=true", "--format", "{{.Name}}\tvolume"]],
  "network prune": [["network", "ls", "--filter", "dangling=true", "--format", "{{.Name}}\tnetwork"]],
  "system prune": [
    ["ps", "-a", "--filter", "status=exited", "--filter", "status=created", "--format", "{{.Names}}\tcontainer"],
    ["network", "ls", "--filter", "dangling=true", "--format", "{{.Name}}\tnetwork"],
    ["images", "-f", "dangling=true", "--format", "{{.ID}}\tdangling image"],
  ],
};

/**
 * The docker invocation for each kind, which is **not** the verb the user types.
 *
 * `/prune` is `docker container prune`; there is no `docker prune`. Deriving the
 * argv from the manifest name by splitting on a space gets three of the four
 * right and produces `docker prune` for the fourth, which exits with a usage
 * error — and the listing succeeds first, so the confirm shows the correct set
 * and *then* the removal fails. Found by running one; the scripted runner in the
 * unit suite accepts any argv, so nothing there could see it.
 */
const DOCKER_VERB: Readonly<Record<PruneKind, readonly string[]>> = {
  prune: ["container", "prune"],
  "volume prune": ["volume", "prune"],
  "network prune": ["network", "prune"],
  "system prune": ["system", "prune"],
};

const NOUN: Readonly<Record<PruneKind, string>> = {
  prune: "stopped container",
  "volume prune": "unused volume",
  "network prune": "unused network",
  "system prune": "reclaimable item",
};

/** `--filter x` is forwarded to both the listing and the prune, or they disagree. */
function filterOf(args: readonly string[]): readonly string[] {
  const i = args.indexOf("--filter");
  if (i >= 0 && args[i + 1] !== undefined) return ["--filter", args[i + 1]!];
  const inline = args.find((a) => a.startsWith("--filter="));
  return inline === undefined ? [] : ["--filter", inline.slice(9)];
}

export function createPruneHandler(
  kind: PruneKind,
  runner: Runner = realRunner,
): (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  const verb = DOCKER_VERB[kind];
  return async (args, ctx) => {
    const filter = filterOf(args);
    const force = args.includes("--force") || args.includes("-f");

    const rows: { name: string; what: string }[] = [];
    for (const list of LISTS[kind]) {
      // The filter goes to the listing too. Without it the question shows a set
      // the prune will not take, which is worse than showing nothing — it is a
      // confirm that is wrong about its own subject.
      const argv = filter.length === 0 ? list : [...list.slice(0, 2), ...filter, ...list.slice(2)];
      try {
        const { stdout } = await runner(argv);
        for (const line of stdout.split("\n")) {
          const [name, what] = line.trim().split("\t");
          if (name !== undefined && name !== "") rows.push({ name, what: what ?? "" });
        }
      } catch {
        // A listing that fails is not a reason to refuse the verb, but it is a
        // reason not to claim the set is empty — that would take the zero arm
        // and report "nothing to remove" about a question never asked.
        return errorDoc(ctx.command, [...verb], `could not list what \`/${kind}\` would remove`);
      }
    }

    // **Ruling C's zero case: do not ask.** Nothing to remove is not a question.
    if (rows.length === 0) {
      return okDoc(ctx.command, [...verb], [
        b.notice.ok(`nothing to remove — no ${NOUN[kind]}s${filter.length > 0 ? " match" : ""}`),
      ]);
    }

    if (!force) {
      const answer = await ctx.ask({
        question: `Remove ${String(rows.length)} ${NOUN[kind]}${rows.length === 1 ? "" : "s"}? This cannot be undone.`,
        detail: b.table({
          id: "prune-detail",
          columns: [
            b.col("name", { label: "NAME", priority: 90, minWidth: 12, flex: true }),
            b.col("what", { label: "WHAT", priority: 50, minWidth: 24 }),
          ],
          // Ruling C is that the question carries what it will destroy. The whole
          // list, not a count: a count is a number to agree with, and a list is
          // something a reader can find a name they did not expect in.
          rows: rows.map((r, i) => b.row(`p${String(i)}`, { name: r.name, what: r.what })),
        }),
        choices: [
          { key: "y", label: "yes" },
          { key: "n", label: "no", default: true },
        ],
      });
      if (answer !== "y") {
        return okDoc(ctx.command, [...verb], [b.notice.warn("nothing removed")]);
      }
    }

    const argv = [...verb, "--force", ...filter];
    try {
      await runner(argv);
    } catch (cause) {
      return errorDoc(ctx.command, argv, stderrOf(cause) || `\`/${kind}\` failed`);
    }
    return okDoc(ctx.command, argv, [
      b.notice.ok(`removed ${String(rows.length)} ${NOUN[kind]}${rows.length === 1 ? "" : "s"}`),
    ]);
  };
}

export function destructiveHandlers(
  runner: Runner = realRunner,
): Record<string, (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument>> {
  return {
    rm: createRmHandler(runner),
    rmi: createRmiHandler(runner),
    prune: createPruneHandler("prune", runner),
    "volume prune": createPruneHandler("volume prune", runner),
    "network prune": createPruneHandler("network prune", runner),
    "system prune": createPruneHandler("system prune", runner),
  };
}
