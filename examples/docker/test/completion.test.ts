/**
 * The app's completion sources — containers, images and paths.
 *
 * **Against the corpus and an injected runner**, never a daemon: C19 injects a
 * directory reader for exactly this reason (C19 I17), and the failure mode of
 * an ambient call is a suite that passes on the author's machine. Every fixture
 * here is real output from a real daemon.
 *
 * `contextAt` builds the context the way the shell does, so these rows go
 * through the same derivation the prompt does rather than a hand-built `Slot` —
 * which is what makes them a claim about `/config dtui-cfg /etc/` rather than
 * about an object literal.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contextAt, parseManifest } from "@fmx/calcium";
import type { CompletionContext, Manifest } from "@fmx/calcium";
import { buildManifest } from "../src/manifest.ts";
import { containerPathSource, containerSource, imageSource, type Run } from "../src/completion.ts";

const corpus = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const PS = corpus("ps-all-real.ndjson");
const IMAGES = corpus("images-real.ndjson");
const LS = corpus("exec-ls-real.txt");

/** The app's real manifest, so the argument names are the ones it ships. */
function manifest(): Manifest {
  const parsed = parseManifest(buildManifest("29.4.1") as unknown as Record<string, unknown>);
  if (!parsed.ok) throw new Error("the app's manifest must parse");
  return parsed.value;
}

/** `‸` marks the cursor, as C19's own fixtures do. */
function at(line: string): CompletionContext {
  const cursor = line.indexOf("‸");
  return contextAt(line.replace("‸", ""), cursor, manifest());
}

/** Records what was asked for, so a row can assert the invocation as well. */
function runner(answer: string): { run: Run; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      calls.push([...args]);
      return Promise.resolve(answer);
    },
  };
}

describe("container names — nine arguments, one source", () => {
  it("completes the container argument of every verb that declares one", async () => {
    // **Driven from the manifest rather than from a list here.** The source
    // keys on the *argument's* name, so this asks the manifest which tools
    // declare one — a hand-written list would agree with itself and go stale
    // the day a tenth verb is added, silently, as an empty menu.
    const declaring = manifest()
      .tools.filter((t) => t.args.some((a) => ["container", "a", "b"].includes(a.name)))
      .map((t) => t.name);
    expect(declaring.length, "the manifest has several, so this is not vacuous").toBeGreaterThan(5);

    for (const verb of declaring) {
      const { run } = runner(PS);
      const got = await containerSource(run).complete(at(`/${verb} ‸`));
      expect(got.length, `${verb} offers containers`).toBeGreaterThan(0);
    }
  });

  it("carries the status as the hint and the state as a tone", async () => {
    const { run, calls } = runner(PS);
    const got = await containerSource(run).complete(at("/logs ‸"));

    expect(calls, "asked the daemon for every container, running or not").toEqual([
      ["ps", "-a", "--format", "json"],
    ]);

    const running = got.find((c) => c.tone === "ok");
    expect(running?.value, "a name, not an id — a name is what the user types").toBeTruthy();
    expect(running?.detail, "the status is the hint").toMatch(/Up|Exited|Created/);

    // **The tone rather than a glyph or a colour** (C04 I6): a `Tone` is a
    // palette slot, so a stopped container reads as stopped in every theme and
    // at the depth where it reads as nothing, the status text still says it.
    expect(new Set(got.map((c) => c.tone)).size, "the corpus has more than one state").toBeGreaterThan(
      1,
    );
  });

  it("offers nothing for an argument that is not a container", async () => {
    // The control. Every source here declares `positional`, so the engine hands
    // all three every positional slot and each has to recognise its own — a
    // source that answers for any positional would offer container names as
    // the path argument and as the image one.
    const { run, calls } = runner(PS);
    expect(await containerSource(run).complete(at("/images ‸"))).toEqual([]);
    expect(calls, "and does not ask the daemon to find that out").toEqual([]);
  });
});

describe("image repositories", () => {
  it("completes the repository argument, deduplicated and without dangling images", async () => {
    const { run } = runner(IMAGES);
    const got = await imageSource(run).complete(at("/images ‸"));

    expect(got.length).toBeGreaterThan(0);
    expect(got.map((c) => c.value), "a dangling image has nothing to type").not.toContain("<none>");
    expect(
      new Set(got.map((c) => c.value)).size,
      "one entry per repository, though a repository has many tags",
    ).toBe(got.length);
  });

  it("offers nothing for a container argument", async () => {
    const { run } = runner(IMAGES);
    expect(await imageSource(run).complete(at("/logs ‸"))).toEqual([]);
  });
});

describe("paths inside a container — the argument that needs another argument", () => {
  it("lists the directory the prefix is inside, in the container named first", async () => {
    const { run, calls } = runner(LS);
    const got = await containerPathSource(run).complete(at("/config dtui-cfg /etc/nginx/ngi‸"));

    // **The container comes from argument one**, which is the whole reason this
    // source exists as a test of the context model rather than as a third list.
    expect(calls).toEqual([["exec", "dtui-cfg", "ls", "-1pL", "/etc/nginx/"]]);

    // The values are whole paths, because the engine filters candidates by the
    // typed prefix and the prefix is `/etc/nginx/ngi`.
    expect(got.map((c) => c.value)).toContain("/etc/nginx/nginx.conf");
    expect(got.every((c) => c.value.startsWith("/etc/nginx/")), "whole paths").toBe(true);
  });

  it("a directory continues and a file is finished (C19 I16)", async () => {
    const { run } = runner(LS);
    const got = await containerPathSource(run).complete(at("/config dtui-cfg /etc/nginx/‸"));

    const dir = got.find((c) => c.value === "/etc/nginx/conf.d/");
    const file = got.find((c) => c.value === "/etc/nginx/nginx.conf");
    expect(dir?.delimiter, "a directory is not a finished word").toBe("");
    expect(file?.delimiter, "and a file is").toBe(" ");

    // **The symlink, and it is why the listing asks for `-L`.** `/etc/nginx/
    // modules` is a symlink to a directory; `ls -p` marks real directories
    // only, so without `-L` this candidate arrives with a trailing space and
    // the one thing a user wants to do with it — descend — is what it prevents.
    // Nothing about the candidate looks wrong: the delimiter is invisible
    // until it is typed past.
    const link = got.find((c) => c.value === "/etc/nginx/modules/");
    expect(link, "a symlinked directory is a directory").toBeDefined();
    expect(link?.delimiter).toBe("");
  });

  it("offers nothing, and asks nothing, with no container named", async () => {
    // **The wrong answer here is the host's filesystem**, which reads as a
    // working completion until someone notices the paths are the machine's
    // rather than the container's.
    const { run, calls } = runner(LS);
    expect(await containerPathSource(run).complete(at("/config /et‸"))).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("survives a container that cannot be reached", async () => {
    // C19 drops a throwing source from the request (C19 I6), so this could
    // throw — an empty answer is the honest one for a directory that is not
    // there yet, and it keeps a line out of the debug sink for ordinary typing.
    const run: Run = () => Promise.reject(new Error("Error: No such container: gone"));
    expect(await containerPathSource(run).complete(at("/config gone /et‸"))).toEqual([]);
  });
});
