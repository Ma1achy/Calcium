// C20 tier 6 — fail-on-revert. Each test names the change that makes it fail,
// not just the assertion.
//
// These are the mutations run against every module on landing. Four of C16's
// defects came out of a pass like this and none was visible from a green run.
import { describe, expect, it } from "vitest";

import { redact } from "../../src/interaction/history/index.js";
import { COMMANDS, META, openWith, seedFiles, entry } from "../support/history.js";

const three = seedFiles([
  entry("/ps --status=running", 1_000),
  entry("/logs digit-42", 2_000),
  entry("/deploy --target=prod", 3_000),
]);

describe("T6.1, T6.2 (I5, I6): redaction reverted to `j22`'s rule, or applied in memory", () => {
  it("entropy alone destroys every identifier in the history", () => {
    // The mutation: drop the positional rules and the exemptions, keeping
    // length ≥ 20 and ≥ 3.5 bits. It passes every test about secrets and
    // destroys the entries people actually want back.
    for (const command of [
      "/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12",
      "/promote e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "/logs --path=/var/folders/T/x9f2kd8s0shx7q1p/prism-run",
    ]) {
      expect(redact(command).text).toBe(command);
    }
  });

  it("redacting in memory as well stops `↑` working within a session", async () => {
    // The mutation: redact in `append` before the entry is stored, rather than
    // only in the string handed to the writer. Every disk assertion still
    // passes; the user pastes a token and loses the command they just ran.
    const { store, fs } = await openWith();
    store.append("/deploy --token=ghp_16C7e42F292c6912E7710c838347Ae178B4a", 0);
    await store.flush();

    expect(store.previous("")).toContain("ghp_");
    expect(fs.files.get(COMMANDS)).not.toContain("ghp_");
  });
});

describe("T6.19, T6.20, T6.21 (I24–I26): the four rules that read as correct", () => {
  it("a `/token/` match without boundaries redacts a count", () => {
    // The mutation: `/token|password|.../i` without the boundary group.
    expect(redact("/ps --tokens=3").text).toBe("/ps --tokens=3");
  });

  it("a next-token rule without the dash guard eats the following flag", () => {
    // The mutation: drop `!next.text.startsWith("-")`.
    expect(redact("/deploy --api-key --verbose").text).toBe("/deploy --api-key --verbose");
  });

  it("scanning tokens only leaves the delegated shell's secret in full", () => {
    // The mutation: remove the text-level assignment scan, keeping the token
    // one. The commonest way a secret reaches the shell path survives.
    expect(redact('sh -c "GITLAB_PASSWORD=hunter2 deploy"').text).not.toContain("hunter2");
    expect(redact("curl 'https://h/a?private_token=abc123'").text).not.toContain("abc123");
  });

  it("a compound token treated as opaque leaves a header's secret in full", () => {
    // The mutation: `if (/\s/.test(slot.text)) return;` without the recursion
    // into atoms. A `PRIVATE-TOKEN: ghp_…` header is neither an assignment nor
    // a flag value, so only the entropy net catches it — and the net was
    // outside the quotes.
    const secret = "ghp_16C7e42F292c6912E7710c838347Ae178B4a";
    expect(redact(`sh -c "curl -H 'PRIVATE-TOKEN: ${secret}'"`).text).not.toContain(secret);
  });

  it("a path exemption of `contains a slash` exempts base64", () => {
    // The mutation: `text.includes("/")` as the whole path test.
    expect(redact("/upload Zm9vYmFy/YmF6cXV4+OTk5OTk5OTk5OQ==").text).toBe("/upload [REDACTED]");
  });
});

describe("T6.3, T6.4, T6.17, T6.18, T6.22 (I2, I3, I21, I22): the two machines", () => {
  it("dropping the draft stash loses the half-typed command", async () => {
    // The mutation: `previous()` nullary, or stashing on every call rather than
    // the first. The second passes T1.6 and fails here on the third `↑`.
    const { store } = await openWith(three);
    store.previous("/pro");
    store.previous("/pro");
    store.previous("/pro");
    expect(store.next()).toBe("/logs digit-42");
    expect(store.next()).toBe("/deploy --target=prod");
    expect(store.next()).toBe("/pro");
  });

  it("not resetting on submit resumes `↑` from a stale position", async () => {
    // The mutation: remove `nav.reset()` from `append`.
    const { store } = await openWith(three);
    store.previous("");
    store.previous("");
    store.append("/build", 0);
    expect(store.navigating).toBe(false);
    expect(store.previous("")).toBe("/build");
  });

  it("accepting a search result without moving the cursor walks the wrong list", async () => {
    // The mutation: `searchEnd("accept")` returning the string without calling
    // `nav.acceptAt`. `↓` then walks relative to an entry that is not the one
    // on screen — every assertion about the returned string still passes.
    const { store } = await openWith(three);
    store.previous("gi");
    store.searchOpen("gi");
    store.searchType("ps");
    expect(store.searchEnd("accept")).toBe("/ps --status=running");
    expect(store.next()).toBe("/logs digit-42");
  });

  it("clearing the hit on a failed keystroke undoes a deliberate walk", async () => {
    // The mutation: `hit: null` when a narrowing keystroke matches nothing.
    // T1.13 passes either way — the result is empty under both readings.
    const { store } = await openWith(three);
    store.searchOpen("");
    store.searchType("/");
    store.searchOlder();
    store.searchOlder();
    expect(store.searchState?.hit?.index).toBe(0);

    store.searchType("zzz");
    store.searchBackspace();
    store.searchBackspace();
    store.searchBackspace();
    expect(store.searchState?.hit?.index).toBe(0);
  });

  it("re-reading `entries[index]` returns a command the user never chose", async () => {
    // The mutation: `searchEnd` returning `entries[hit.index].command`.
    //
    // **At the cap**, because that is the only thing that renumbers: an append
    // to an uncapped store adds at the end and every index still names what it
    // named. Written the easy way this test passes under the mutation, which is
    // how it was written and what the mutation pass caught.
    const { store } = await openWith(three, { cap: 3 });
    store.searchOpen("");
    store.searchType("logs");
    store.append("/one", 0);
    store.append("/two", 0);
    expect(store.entries[1]?.command).toBe("/one");
    expect(store.searchEnd("submit")).toBe("/logs digit-42");
  });
});

describe("T6.5, T6.6, T6.7, T6.13, T6.14, T6.23 (I7, I8, I9, I16, I18, I27): the file", () => {
  it("writing newlines unescaped corrupts the file on the first Alt-Enter", async () => {
    // The mutation: write `command` rather than `escape(command)`.
    const { store, fs } = await openWith();
    store.append("/deploy \\\n  --now", 0);
    await store.flush();
    expect((fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "")).toHaveLength(1);
  });

  it("treating a write failure as fatal ends the session on a read-only home", async () => {
    // The mutation: let the rejection escape the writer, or throw from `append`.
    const { store, fs } = await openWith();
    fs.fail("readOnly");
    expect(() => {
      store.append("/ps", 0);
    }).not.toThrow();
    await store.flush();
    expect(store.entries).toHaveLength(1);
  });

  it("refusing to start on corruption ends the session before it opens", async () => {
    // The mutation: throw from `load` instead of returning an empty history.
    await expect(openWith({ [COMMANDS]: "\\qbad\n" })).resolves.toBeDefined();
  });

  it("issuing appends in parallel de-aligns the sidecar", async () => {
    // The mutation: `void fs.appendFile(...)` per append instead of one chain.
    // Every length assertion still passes; each timestamp names the wrong
    // command, which nothing but an alignment check can see.
    const { store, fs } = await openWith();
    fs.jitter(true);
    for (let i = 0; i < 20; i += 1) store.append(`/ps ${String(i)}`, 0);
    await store.flush();

    const commands = (fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "");
    const meta = (fs.files.get(META) ?? "").split("\n").filter((l) => l !== "");
    commands.forEach((command, i) => {
      expect([command, Number((meta[i] ?? "").split(" ")[0])]).toEqual([
        `/ps ${String(i)}`,
        1_700_000_000_000 + i * 1_000,
      ]);
    });
  });

  it("draining from the last issued write loses the command just typed", async () => {
    // The mutation: `drain` starting from `issued` rather than `confirmed`.
    // Nothing else changes, and the entry lost is the newest one.
    const { store, fs } = await openWith();
    fs.jitter(true);
    store.append("/ps", 0);
    await Promise.resolve();
    store.drain();

    const next = await openWith({
      [COMMANDS]: fs.files.get(COMMANDS) ?? "",
      [META]: fs.files.get(META) ?? "",
    });
    expect(next.store.entries.map((e) => e.command)).toEqual(["/ps"]);
  });

  it("appending to a file already declared corrupt loses every future session", async () => {
    // The mutation: `writer.seed(entries)` without the damaged flag. The
    // session works, and the next one opens on the same broken file.
    const { store, fs } = await openWith({ [COMMANDS]: "\\qbad\n" });
    store.append("/ps", 0);
    await store.flush();

    const next = await openWith({
      [COMMANDS]: fs.files.get(COMMANDS) ?? "",
      [META]: fs.files.get(META) ?? "",
    });
    expect(next.store.entries.map((e) => e.command)).toEqual(["/ps"]);
    expect(next.store.warnings).toEqual([]);
  });
});

describe("T6.10, T6.11, T6.12 (I14, I4, I12): the rest", () => {
  it("a dismissable clear confirm lets a stray Esc wipe history", async () => {
    const { store } = await openWith(three);
    expect(store.clearConfirmLayer().dismissable).toBe(false);
  });

  it("storing consecutive duplicates makes `↑` walk the same command", async () => {
    const { store } = await openWith();
    for (let i = 0; i < 5; i += 1) store.append("/ps", 0);
    expect(store.entries).toHaveLength(1);
    store.append("/logs", 0);
    expect(store.previous("")).toBe("/logs");
    expect(store.previous("")).toBe("/ps");
  });

  it("hardcoding the state directory makes two sessions share one history", async () => {
    // T2.4b: `stateDir` is injected, so two stores do not observe each other.
    const a = await openWith();
    a.store.append("/ps", 0);
    await a.store.flush();

    const b = await openWith();
    expect(b.store.entries).toEqual([]);
  });
});
