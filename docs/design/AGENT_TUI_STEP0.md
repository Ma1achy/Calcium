# `agent-tui` step 0 — the far side, run

**Run 2026-08-15.** The design's §6 says step 0 comes *first and separately*, and that nothing
is designed until reasoning and tool-call parts are confirmed to **arrive as parts**. This is
that run, and its output is the thing the rest of the build is planned against.

The precedent is docker-tui's step 1: `docker ps --json` was `unknown flag`, and eight
drawings were wrong because they were drawn before the far side was run.

---

## What was run, and against what

| | |
|---|---|
| transport | **ollama 0.24.0**, already listening on the host at `127.0.0.1:11434` |
| model | **`qwen3.5:9b`** — 6.59 GB, the only model pulled, and it does both parts |
| from | the devcontainer, over `host.docker.internal:11434` — verified reachable |
| SDK | `ai@7.0.66` + `@ai-sdk/openai-compatible@3.0.30`, installed in a scratch dir |

**Two probes, in this order, and the order is the point.** The wire first, because an SDK
cannot manufacture what the transport does not carry — if `<think>` had arrived inside
`content`, no amount of typed-part machinery upstream would have separated it, and that would
have been a finding about the model rather than the SDK. The parts second, because the design's
claim is one layer up from the wire.

Nothing was installed into the repository. `DEPENDENCIES.md` gains no row: **step 0 is a
measurement, not a build**, and the dependency question is settled when something is built.

---

## S0-1 · The parts arrive — and there are fifteen of them, not seven

§2's table has seven lines. The stream emits **fifteen types**, and the extra ones are not
noise:

```
part type            count   first payload
reasoning-delta         90   {"id":"reasoning-0","text":"The"}
text-delta              22   {"id":"txt-0","text":"There"}
start-step               2   {"request":{},"warnings":[]}
reasoning-start          2   {"id":"reasoning-0"}
reasoning-end            2   {"id":"reasoning-0"}
finish-step              2   {"finishReason":"tool-calls", …,"stepTimeMs":44690}
start                    1
tool-input-start         1   {"id":"call_9nkphd3f","toolName":"list_dir"}
tool-input-delta         1   {"id":"call_9nkphd3f","delta":"{\"path\":\"/etc\"}"}
tool-input-end           1   {"id":"call_9nkphd3f"}
tool-call                1   {"toolCallId":"call_9nkphd3f","input":{"path":"/etc"}}
tool-result              1   {"toolCallId":"call_9nkphd3f","output":{…}}
text-start / text-end    1 each
finish                   1
```

**And the shape is different from the one the table implies.** Every content run is bracketed
`-start` → `-delta`… → `-end`, and each bracket carries an **`id`**: `txt-0`, `reasoning-0`,
`call_9nkphd3f`.

That id is not decoration. **It is the block id**, and it makes the adapter three verbs rather
than a seven-way switch:

```
-start   mints a live block with that id
-delta   patches it
-end     settles it
```

Which is **C13's live-entry lifecycle exactly** — `append` (with `streaming: true`), `patch`, then `settle` (`src/viewport/transcript/types.ts`). This said *`putBlock` then `settle`*; measured 2026-09-03, `putBlock` is `DocumentView.putBlock` in `src/shell/document-view.ts` — the pushed view's total block replace, a different component — and C13 has no verb of that name. The mapping is a
better fit than the design assumed, and that is worth more than the correction costs: a
seven-case switch on part type would have been written, and it would have had to grow the
id-keyed state back by hand.

## S0-2 · A tool call's arguments stream

`tool-input-start` / `-delta` / `-end` precede `tool-call`, on the same id. A2 draws a tool
call as a live block appearing at once with *name, args, running*; the name arrives first and
the arguments arrive **after it, incrementally**.

Here it was one delta, because `{"path":"/etc"}` is fifteen characters. **`apply_patch`'s
argument is a file**, so the same path that took one delta will take hundreds — and A2's card
has to be drawable with the name known and the arguments partial, which is a state the drawing
does not have.

## S0-3 · Reasoning is the majority of the stream, and this is the finding that moves the build

**90 reasoning deltas against 22 text deltas.** Four to one, for a question whose answer is one
sentence. The prose-only probe is worse and clearer: **569 characters of reasoning to produce
the five-character answer `ready`.**

And by time rather than volume: `stepTimeMs` on the first step was **44.7 seconds**, essentially
all of it before any tool call or any text.

§14 rules reasoning as *prose in a collapsed panel*, and **the ruling survives** — nothing here
argues for a block kind. What does not survive is the weight. The ruling was made against
reasoning as an aside, and the measurement says it is the **primary thing on screen for most of
a turn**. Two consequences, and both are ordering rather than design:

- **A7 is load-bearing for step 1, not step 3.** The design already moved A7 ahead of A3 and A4
  because *an approval with nothing saying what is running looks like the session hung*. The
  same sentence is true of the first forty-five seconds of every turn, so A1 minimal has the
  same problem A3 does, and it has it first.
- **The collapsed header is the primary surface, not the fallback.** §14 says the header's token
  count ticks while the body arrives unseen. That is not a detail of the collapsed case — it is
  what the user is looking at, and it should be drawn as such.

## S0-4 · The ids collide across steps — the same shape as C26 §8b.6

Two `reasoning-start` / `-end` pairs arrived, one per step, **both carrying the id
`reasoning-0`.**

So the ids in S0-1 are unique **within a step**, not within a session. An adapter keying blocks
on the part id directly — which is the obvious reading of S0-1 and the one worth writing down
before someone writes it — would have the second step's reasoning **patch the first step's
block**, and the first reasoning run would be overwritten by the second.

**This is C26 §8b.6's defect in a different component**: an id that is unique in its own scope
used in a flatter one. The remedy is the same shape — the block id is the address, and here the
address is `(step index, part id)`.

**And §14 predicted the state.** It ruled that the model reasons, calls a tool, reasons again,
so they are *separate blocks separated by the call, and merging would lie about the order.* The
far side produced exactly that, and produced ids that would silently merge them.

## S0-5 · The fragile step the design named does not exist on this transport

§5 says step 0's job is verifying `--reasoning-parser` and `--tool-call-parser`, *because
without them reasoning and tool-call output are not parsed correctly.*

**True of MLX, and not a property of "the local path".** Ollama parses server-side; a stock
`qwen3.5:9b` pull emitted both part kinds with no flags, no configuration and no model-specific
setup. So the risk is MLX's specifically, and **ollama is the verified default** — the design
has it as the cross-platform equivalent in a footnote, on no measurement, and it is the one
that has actually been run.

This is where the claim was written down and where it came from: the MLX flags are real, the
generalisation to "the local path" was the compression.

## S0-6 · The wire field is `reasoning`, not `reasoning_content`

Recorded rather than acted on. It matters only to someone writing a transport by hand, which
this example will not do — but a wrong field name reads as *the model does not emit reasoning*,
which is the expensive way to find out.

---

## The probes

Reproducible, because a record whose measurement cannot be re-run is a claim. Both are
standalone: `mkdir /tmp/step0 && npm init -y && npm pkg set type=module && npm i ai
@ai-sdk/openai-compatible zod`, then run under Node 22 in the devcontainer.

### Probe A — the wire

```js
const BASE = process.env.OLLAMA ?? "http://host.docker.internal:11434";
const MODEL = "qwen3.5:9b";
const TOOLS = [{ type: "function", function: {
  name: "list_dir", description: "List the files in a directory.",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } }];

async function run(label, body) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not-needed" },
    body: JSON.stringify({ model: MODEL, stream: true, ...body }),
  });
  const keys = new Map();
  let text = "", reasoning = "", finish = null;
  const calls = [];
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      const choice = JSON.parse(payload).choices?.[0];
      const d = choice?.delta ?? {};
      for (const k of Object.keys(d)) keys.set(k, (keys.get(k) ?? 0) + 1);
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (typeof d.content === "string") text += d.content;
      if (typeof d.reasoning === "string") reasoning += d.reasoning;
      if (typeof d.reasoning_content === "string") reasoning += d.reasoning_content;
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { name: "", args: "" };
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
    }
  }
  console.log(`\n=== ${label} ===`);
  console.log("delta fields:", JSON.stringify(Object.fromEntries(keys)), "| finish:", finish);
  console.log(`reasoning ${reasoning.length} chars | content ${text.length} chars`);
  console.log("tool_calls:", JSON.stringify(calls));
  if (/<think>/.test(text)) console.log("!! reasoning leaked into content as tags");
}

await run("tools, default thinking", {
  messages: [{ role: "user", content: "What files are in /etc? Use the tool." }], tools: TOOLS });
await run("prose only", { messages: [{ role: "user", content: "Say the single word: ready." }] });
```

Its output, which is S0-3's and S0-6's evidence:

```
=== tools, default thinking ===
delta fields: {"role":32,"content":32,"reasoning":30,"tool_calls":1} | finish: tool_calls
reasoning 136 chars | content 0 chars
tool_calls: [{"name":"list_dir","args":"{\"path\":\"/etc\"}"}]

=== prose only ===
delta fields: {"role":129,"content":129,"reasoning":127} | finish: stop
reasoning 569 chars | content 5 chars
```

### Probe B — the parts

```js
import { streamText, tool, stepCountIs } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const provider = createOpenAICompatible({
  name: "ollama",
  baseURL: (process.env.OLLAMA ?? "http://host.docker.internal:11434") + "/v1",
  apiKey: "not-needed",
});

const result = streamText({
  model: provider("qwen3.5:9b"),
  tools: { list_dir: tool({
    description: "List the files in a directory.",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => ({ path, entries: ["hosts", "passwd", "shells"] }),
  }) },
  stopWhen: stepCountIs(3),
  prompt: "What files are in /etc? Use the tool, then say how many there are.",
});

const counts = new Map(), order = [], sample = new Map();
for await (const part of result.fullStream) {
  counts.set(part.type, (counts.get(part.type) ?? 0) + 1);
  if (order.at(-1) !== part.type) order.push(part.type);
  if (!sample.has(part.type)) {
    const { type, ...rest } = part;
    sample.set(type, JSON.stringify(rest).slice(0, 160));
  }
}
for (const [t, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(22)} ${String(n).padStart(4)}   ${sample.get(t)}`);
}
console.log("\n  " + order.join(" → "));
```

**The arrival order is S0-4's evidence, and it is worth reading as a sequence rather than a
count** — the second `reasoning-start` carries the id the first one already used:

```
start → start-step → reasoning-start → reasoning-delta → reasoning-end
      → tool-input-start → tool-input-delta → tool-input-end → tool-call → tool-result
      → finish-step
      → start-step → reasoning-start → reasoning-delta → reasoning-end
      → text-start → text-delta → text-end → finish-step → finish
```

---

## What step 0 does **not** settle

Named so their absence is a decision, and because a probe that reports more than it measured is
the instrument manufacturing evidence.

- **One model, one transport.** A priced API chunks where a local model streams token by token,
  and §5 makes that difference a claim. It has not been measured, and S0-3's ratio in particular
  is `qwen3.5:9b`'s — a model without a thinking mode would invert it.
- **No frame was drawn.** Every drawing in the design is still a placeholder; step 0 measured
  the stream, not the rendering.
- **`error` and `abort` parts were not provoked.** §2's table has an `error` line and A4 is
  built on interruption; neither part type appeared in a successful run, so neither is verified.
