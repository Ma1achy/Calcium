import { b, createTui, defaultTheme } from "@fmx/calcium";
import type { Adapter } from "@fmx/calcium";

/** What operations exist. One tool, no arguments, no flags. */
const manifest = {
  schema: "tui.manifest/1",
  binary: "svc",
  version: "1.0.0",
  tools: [{ name: "list", local: false, summary: "List services", args: [], flags: [] }],
} as const;

/** Data in, blocks out. This is the whole extension model. */
const list: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => {
    const rows = raw.stdoutRaw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return {
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [
        b.table({
          columns: [
            b.col("name", { label: "SERVICE", minWidth: 12, flex: true }),
            b.col("state", { label: "STATE", minWidth: 10 }),
            b.col("replicas", { label: "REPLICAS", minWidth: 8, align: "right" }),
          ],
          rows: rows.map((r) => ({
            id: String(r["name"]),
            cells: {
              name: { text: String(r["name"]) },
              state: {
                text: String(r["state"]),
                tone: r["state"] === "running" ? "ok" : "muted",
                glyph: r["state"] === "running" ? "running" : "queued",
              },
              replicas: { text: String(r["replicas"]) },
            },
          })),
        }),
        b.notice("muted", `${String(rows.length)} services`),
      ],
      meta: {
        verb: ctx.verb,
        adapter: "list",
        // `?? 0` because `RawResult.exitCode` is `number | null` and
        // `DocumentMeta.exitCode` is `number`. See FINDINGS F58 — every adapter
        // in this repository writes this line, and it says a signalled process
        // exited cleanly.
        exitCode: raw.exitCode ?? 0,
        durationMs: raw.durationMs,
        truncated: false,
        argv: raw.argv,
        stderr: raw.stderr,
        transport: ctx.transport,
        origin: ctx.origin,
      },
    };
  },
};

const tui = createTui({
  name: "svc-tui",
  binary: new URL("bin/svc", import.meta.url).pathname,
  manifest,
  theme: defaultTheme,
  env: process.env,
  adapters: { list },
});

await tui.start();
