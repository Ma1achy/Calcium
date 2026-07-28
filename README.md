# tui-kit

A framework for building terminal user interfaces over CLIs that emit JSON.

Point it at a binary, describe its verbs, and you get a fullscreen shell with a
scrollable transcript, tab completion, history, themes, and graceful degradation
down to a 60-column monochrome ASCII terminal.

## Quick start

```ts
import { createTui, b, defaultTheme, type Adapter } from "@fmx/tui-kit";
import manifest from "./docker.manifest.json" with { type: "json" };

const ps: Adapter = {
  schema: "tui.view/1",
  adapt: (raw, ctx) => ({
    schema: "tui.view/1",
    command: ctx.command,
    status: "ok",
    meta: { verb: "ps", adapter: "ps", exitCode: 0, durationMs: 0, truncated: false },
    blocks: [
      b.rule(`containers · ${(raw.stdout as any[]).length}`),
      b.table({
        columns: [
          b.col("name",  { priority: 95, min: 16, flex: true }),
          b.col("image", { priority: 60, min: 20 }),
          b.col("state", { priority: 85, min: 10 }),
        ],
        rows: (raw.stdout as any[]).map((c) =>
          b.row(c.ID, { name: c.Names, image: c.Image, state: c.State })),
      }),
    ],
  }),
};

createTui({
  name: "docker",
  binary: "docker",
  manifest,
  theme: defaultTheme,
  adapters: { ps },
});
```

That is a working shell. Verbs without an adapter still render, through the
fallback — so you can add them one at a time.

## Two runtime dependencies

`react` and `ink`. Everything else the framework needs is already in Node.
See [DEPENDENCIES.md](./DEPENDENCIES.md) for what is deliberately absent and why.

## Specs

47 specification documents in [`docs/`](docs/) — 24 component contracts, 4 architecture
documents, 3 behaviours, 15 surfaces and a reference app. Start at
[`docs/README.md`](docs/README.md).

## Development

```
make install    # npm ci, no install scripts
make enforce    # A03 — layer rules, source scans, supply chain (~5s)
make test       # tiers 1-4
make all        # everything, including golden frames and PTY e2e
```

`make enforce` runs before the test suite deliberately: a layer violation should
fail in five seconds, not after two minutes.
