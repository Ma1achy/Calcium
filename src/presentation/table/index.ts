/**
 * C11 — the table engine.
 *
 * Three exports, and each has a consumer: `tableDefinition` for whoever composes
 * the registry (C22, through C09's public `register`), `planColumns` because a
 * custom table-like kind needs it and it is pure (C24 §2, Q2), and
 * `tableElements` for C26, which owns focus while C11 renders it (C11 I14).
 *
 * Nothing else. `PlannedColumns` is the plan's shape and travels with the
 * function; the block shapes are C04's.
 */
export { planColumns, COLUMN_GAP, type PlannedColumns, type PlannedColumn } from "./plan.js";
export { tableDefinition, tableElements } from "./definition.js";
