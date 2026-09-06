/**
 * The one family that is not docker's.
 *
 * Every other file under `manifest/` declares verbs the far side answers, and
 * this one declares a verb about **the framework drawing them** — C28's report,
 * measured off this session's own frames. It gets its own file for that reason
 * rather than being tucked into `read.ts` beside `dashboard` and `drift`: those
 * are local because a docker question needed two calls, and this one is local
 * because there is no far side to ask.
 *
 * **Why the reference application is the profiler's better subject.** The plots
 * example is one process composing static documents; docker-tui spawns, streams
 * (`logs -f`, `container stats`) and refreshes a live dashboard, so its frames
 * carry `transport`, `adapt` and `livefetch` spans that a pure renderer never
 * raises. A profiler read only against a synthetic workload measures the
 * workload.
 */

import type { ToolDef } from "@fmx/calcium";

const profile: ToolDef = {
  name: "profile",
  local: true,
  summary: "This framework, measured — C28's report off this session's frames",
  args: [
    {
      name: "pane",
      type: "string",
      required: false,
      summary: "overview · frame · distribution · memory",
    },
  ],
  flags: [],
};

export const PROFILING_TOOLS: readonly ToolDef[] = [profile];
