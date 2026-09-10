/**
 * The nineteen kinds C09 ships.
 *
 * Twenty-two are declared in C04's union. `table`, `plot` and `patch` are
 * registered by C11, C12 and C25 through the public `register` — they are
 * absent here on purpose, and each of those components carries the assertion
 * that deleting its registration removes the kind, with no fallback path
 * (§3, commitment 2).
 *
 * **Both figures were wrong, and read as deliberate** (F1009). They said
 * *sixteen* and *seventeen*; counted, the array below has **nineteen** entries
 * and `Block` has **twenty-two** members. A number written in prose beside the
 * list it counts is the one thing no gate compares — it drifts by one every
 * time a kind lands, and the sentence around it stays true-sounding — so a
 * three- and a five-kind gap accumulated unread. **T2.136 is what watches this
 * now**, not by counting but by naming every registered kind on one side of the
 * `window` seam or the other and comparing by equality; restore either figure
 * only with the count that produced it.
 */
import { codeDefinition } from "./kinds/code.js";
import { groupDefinition, mosaicDefinition, panelDefinition, scrollDefinition } from "./kinds/containers.js";
import { imageDefinition } from "./kinds/image.js";
import { statusDefinition } from "./kinds/status.js";
import { terminalDefinition } from "./kinds/terminal.js";
import {
  comparisonDefinition,
  eventsDefinition,
  keyValueDefinition,
  logsDefinition,
  stepsDefinition,
} from "./kinds/structured.js";
import {
  noticeDefinition,
  pillsDefinition,
  progressDefinition,
  rawDefinition,
  ruleDefinition,
  tipDefinition,
} from "./kinds/simple.js";
import type { AnyBlockDefinition } from "./types.js";

// **`AnyBlockDefinition`, which is what these are** (C04 I119, F405). The
// declared type was `readonly BlockDefinition[]` — every element promising to
// handle any block — so the list ended with `as BlockDefinition[]` to make the
// lie compile. Each of these handles exactly one kind, and the union says so.
export const DEFAULT_DEFINITIONS: readonly AnyBlockDefinition[] = Object.freeze([
  ruleDefinition,
  noticeDefinition,
  keyValueDefinition,
  stepsDefinition,
  logsDefinition,
  eventsDefinition,
  progressDefinition,
  codeDefinition,
  comparisonDefinition,
  pillsDefinition,
  tipDefinition,
  panelDefinition,
  groupDefinition,
  scrollDefinition,
  mosaicDefinition,
  imageDefinition,
  terminalDefinition,
  statusDefinition,
  rawDefinition,
]);
