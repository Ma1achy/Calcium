// C09 I124, I125 · C23 I84 — expand in place, through the registry's fold
// (ruling 42). Mutated at each joint (C09 T6.142, C23 T6.103).
//
// **The first mutation is the one the plan named**: the dispatcher's fold arm
// put back to the scroll test it replaced. The scroll still folds under it, so
// T4.76 has to fail on the patch, the shedding kind and the app kind, which is
// what says the hook is read and not merely present.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const ACTIONS = "src/shell/actions.ts";
const SHED = "src/presentation/blocks/shed.ts";
const STRUCTURED = "src/presentation/blocks/kinds/structured.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";

const FILES = "test/contract/shed-target.test.ts test/integration/expand-in-place.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SHED,
    from: "  if (block.expanded !== true) return { ...block, expanded: true };",
    to: "  if (block.expanded !== true) return block;",
    why: "the shedding kinds' fold writes nothing — T1.85 asserts the flag written",
  },
  mutations: [
    {
      name: "the fold arm reverted to the scroll test and the registry's hook unread (C23 T6.103)",
      file: ACTIONS,
      from: "          const folded = deps.fold(b);\n          if (folded === null) continue;\n",
      to:
        '          if (b.kind !== "scroll" || (b as { collapsed?: boolean }).collapsed === undefined) continue;\n' +
        "          const folded = { ...b, collapsed: !(b as { collapsed?: boolean }).collapsed } as Block;\n",
      expect: "T4.76",
    },
    {
      name: "the shed elements' activate removed (C09 T6.142)",
      file: SHED,
      from: "        activate,\n        copy: copy(i),\n",
      to: "        copy: copy(i),\n",
      expect: "T1.85",
    },
    {
      name: "expanded ignored by keyValue's render (C09 T6.142)",
      file: STRUCTURED,
      from: "    const opened = block.expanded === true ? keyValueWithheld(block, width) : null;",
      to: "    const opened = null;",
      expect: "T1.85",
    },
    {
      name: "the expanded rows left out of measure (C09 T6.142)",
      file: SHED,
      from: "  if (expanded !== true || lists === null) return 0;\n  return lists.reduce(",
      to: "  return 0;\n  return lists.reduce(",
      expect: "T2.190",
    },
    {
      name: "the detail plan taken at narrow rather than wide (C09 T6.142)",
      file: STRUCTURED,
      from: '  const parts = keyValueParts(block, width, "wide");\n  const plan = naturalSpan(parts, 0)',
      to: '  const parts = keyValueParts(block, width, "narrow");\n  const plan = naturalSpan(parts, 0)',
      expect: "T2.190",
    },
    {
      name: "scroll's fold removed (C09 T6.142)",
      file: CONTAINERS,
      from: "  fold: (block) => (block.collapsed === undefined ? null : { ...block, collapsed: !block.collapsed }),\n",
      to: "",
      expect: "T4.76",
    },
    {
      name: "the label kept where the value would shed (C09 T6.142)",
      file: SHED,
      from: "    const labelled = cells(label, ambiguous) + DETAIL_GAP + minValue <= inner;",
      to: "    const labelled = true;",
      expect: "T1.85",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
