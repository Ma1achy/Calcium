/**
 * The **live** members of a process group — one reader, used from both sides.
 *
 * **There were two copies and both carried the same premise.** `groupMembers`
 * in `process.ts` reads the group from the test's side; `fixture.mjs` reads it
 * from inside the PTY, as a separate process that cannot import TypeScript. Both
 * ran `ps -o pid= -g <pgid>` and both treated *in the process table* as *alive*,
 * so fixing one left tier 5 failing on the other — a test that rolls its own
 * reader carries the premise with it, and two copies read as corroboration.
 *
 * **Zombies are excluded, and it is a portability fix rather than a loosening.**
 * A pipeline signalled as a group dies whole — every child takes the signal —
 * but the shell exits before reaping them, so they are reparented to PID 1. On
 * macOS that is `launchd` and they vanish at once; in a container started
 * without an init, PID 1 is the workload and reaps nothing, so the children stay
 * in the table as `Z` for as long as the run lasts. A group signal that
 * genuinely failed leaves its children `S`, not `Z`, and they are still counted,
 * so nothing the assertion could catch stops being caught.
 *
 * `Z` is the zombie state on BSD and on procps alike, and it is the first
 * character of the state field on both.
 */
export function livePids(psOutput) {
  return psOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => line.split(/\s+/u))
    .filter((parts) => !(parts[1] ?? "").startsWith("Z"))
    .map((parts) => Number(parts[0]))
    .filter((pid) => Number.isFinite(pid));
}

/** The argv both sides run. `stat=` is what makes `livePids` able to answer. */
export function psGroupArgv(pgid) {
  return ["ps", "-o", "pid=,stat=", "-g", String(pgid)];
}
