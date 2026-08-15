/**
 * The fourteen kinds C09 ships.
 *
 * Seventeen are declared in C04's union. `table`, `plot` and `patch` are
 * registered by C11, C12 and C25 through the public `register` — they are
 * absent here on purpose, and each of those components carries the assertion
 * that deleting its registration removes the kind, with no fallback path
 * (§3, commitment 2).
 */
import { codeDefinition } from "./kinds/code.js";
import { groupDefinition, panelDefinition, scrollDefinition } from "./kinds/containers.js";
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
import type { BlockDefinition } from "./types.js";

export const DEFAULT_DEFINITIONS: readonly BlockDefinition[] = Object.freeze([
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
  rawDefinition,
] as BlockDefinition[]);
