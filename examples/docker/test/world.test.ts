/**
 * The demo world — what every published recording of this app is made against.
 *
 * The person's ruling of 2026-09-29: *recordings never show my real docker.* So
 * `src/world.ts` invents a host and `tools/record.ts` drives the real
 * application config (`src/app.ts`) against it under virtual time. These rows
 * hold the three properties that ruling needs, each read off the bytes the
 * application wrote rather than off the world's own tables:
 *
 * 1. the frame is drawn from the invented host — every container of it;
 * 2. nothing of the machine that made it reaches the frame;
 * 3. two recordings of one script are the same bytes.
 *
 * **Why this is not the thing C08 I14 forbids.** D43 is about an adapter's test
 * agreeing with values an animated world invented, so that drift in the world
 * masks a regression in the adapter. Nothing here tests an adapter: the subject
 * is the recording mode itself, and the invented names are its whole contract.
 * The adapters keep their rows over `test/corpus/`.
 *
 * **The frame is read by stripping escapes, and that is enough for what these
 * rows ask** — presence of a name, absence of a string — because the renderer
 * writes a changed row as one run. `screen.py` is the instrument for anything
 * positional, and none of these rows is.
 */

import { describe, expect, it } from "vitest";
import { recordSession, DEMO_CWD } from "../tools/record.ts";
import { ENGINE } from "../src/world.ts";

const TRUE = { LANG: "en_GB.UTF-8", COLORTERM: "truecolor" } as const;
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Everything written, as text with escape sequences removed. */
async function text(script: readonly (readonly [number, string])[], hold: number, cols = 120, rows = 34) {
  const frames = await recordSession(
    cols,
    rows,
    script.map(([t, s]) => [t, enc(s)] as const),
    hold,
    TRUE,
  );
  const raw = Buffer.concat(frames.map(([, b]) => Buffer.from(b))).toString("utf8");
  // eslint-disable-next-line no-control-regex
  return { frames, raw, plain: raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[=>()][0-9A-Za-z]?/gu, "") };
}

const PS = [
  [4.0, "/ps"],
  [6.0, "\r"],
] as const;

describe("the demo world draws an invented host", () => {
  it("W1: the greeting and /ps name every container the world has, and the world's engine", async () => {
    const { plain } = await text(PS, 6);
    for (const name of ["web", "api", "worker", "postgres", "cache", "proxy", "migrate"]) {
      expect(plain, `${name} is drawn`).toContain(name);
    }
    expect(plain).toContain(`engine ${ENGINE}`);
    // The IMAGE column truncates from the start at 120 columns (ps.ts), so the
    // registry's host is the part that goes.
    expect(plain).toContain("test/shop/api:2.4.1");
    // `/ps` without `-a` is the running six, as docker's would be.
    expect(plain).toMatch(/ps · 6 rows/u);
  });

  it("W2: nothing of the recording machine reaches the frame — path, shim, lab names, host memory", async () => {
    const { raw } = await text(PS, 6);
    // The chrome draws the working directory and the far side's binary; both
    // are the world's here. The shim's path is this checkout's, and `dtui-` is
    // the lab fixture set that lives only on a daemon.
    expect(raw).toContain(DEMO_CWD);
    for (const leak of [process.cwd(), "/workspace", "/Users/", "docker-json", "dtui-", "7.75GiB"]) {
      expect(raw.includes(leak), `the frame carries ${leak}`).toBe(false);
    }
  });

  it("W3: two recordings of one script are byte-identical, timestamps included", async () => {
    const a = await text(PS, 12);
    const b = await text(PS, 12);
    expect(a.frames.length).toBeGreaterThan(5);
    expect(b.frames.map(([t]) => t)).toEqual(a.frames.map(([t]) => t));
    expect(b.raw).toBe(a.raw);
  });

  it("W4: the clock the chrome draws is the recording's, not the host's", async () => {
    const { plain } = await text(PS, 6);
    // 09:41 UTC on the ruling's date, plus the seconds the script ran. **Read
    // off the frames the submission drew** (4 s and after): this said `09:41:1x`,
    // which a live greeting ticking every two seconds redrew up to the hold's
    // end — the greeting settles now (DASHBOARD_WALK §E), so the last frame is
    // the one `/ps` drew, and the clock in it is the recording's either way.
    expect(plain).toMatch(/09:41:(?:0[4-9]|1\d)/u);
  });
});

describe("the surfaces the stills are made of", () => {
  it("W5: /logs draws lines as they arrive — the fixture degrades the stream as C06's reader would", async () => {
    // Without the `degraded` patch, C07 drops every `malformed` line and the
    // card runs empty for the whole shot — which the first version did.
    const { plain } = await text(
      [
        [4.0, "/logs web"],
        [6.0, "\r"],
      ],
      8,
      110,
      30,
    );
    expect(plain).toMatch(/"GET \/api\/orders HTTP\/1\.1" 200/u);
  });

  it("W6 (DASHBOARD_WALK §E): the greeting is rows — a summary, the table, the stopped — and no frame", async () => {
    // Read off the frame, because the document-level rows cannot see what the
    // shell wraps around an entry. Restoring the outer panel or the live part
    // draws a corner here. The heatmap's `migrate ┤` row is gone with it (§E E1);
    // the stopped container is named once, as a pill.
    const { plain } = await text([], 6);
    expect(plain).toContain("7 containers · 6 running");
    expect(plain).toContain("migrate");
    expect(plain).not.toMatch(/[┌┐└┘]/u);
  });

  it("W7: /filediff on proxy diffs the bind-mounted config against its image", async () => {
    const { plain } = await text(
      [
        [4.0, "/filediff proxy /etc/nginx/conf.d/default.conf"],
        [6.0, "\r"],
      ],
      6,
      120,
      40,
    );
    // The tail of the diff is what is on screen when the shot settles: the
    // second hunk's additions and the summary.
    expect(plain).toContain("proxy_set_header X-Forwarded-For");
    expect(plain).toMatch(/2 hunks · \+15 -22/u);
  });
});
