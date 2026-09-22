import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const registryPath = resolve(here, 'calcium-registry.json');
export const outputPath = resolve(here, 'calcium-design-language-revised.html');
export const keysOutputPath = resolve(here, 'docs/KEYS.md');

const RULE_ID = /^R-[A-Z]{3}-[0-9]{3}$/;
const BLOCK_RULE_ID = /^R-(?:BLK|BK[A-Z])-[0-9]{3}$/;
const STATUSES = new Set(['current', 'superseded', 'exploratory', 'example']);
const STATE_FACT_KEYS = ['entry', 'carriers', 'actions', 'escape', 'motion-off', 'one-bit', 'residue'];
const STATE_FACT_LABELS = {
  entry: 'entry', carriers: 'carriers', actions: 'actions', escape: 'esc',
  'motion-off': 'motion off', 'one-bit': '1-bit', residue: 'residue'
};
const esc = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const BLOCK_GAP = '<span class=gap> </span>';
const plainBlockText = value => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
  .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
  .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replace(/<[^>]*>/g, '').replace(/[ \t]+\n/g, '\n').trim();
export const isBlockRuleId = id => BLOCK_RULE_ID.test(id);
export const blockContentDigest = renderHtml => createHash('sha256').update(String(renderHtml)).digest('hex');
export const ruleContentDigest = rule => createHash('sha256').update(JSON.stringify([
  rule.title,
  rule.text,
  rule.sectionKey ?? null
])).digest('hex');
export const barSpecimenContentDigest = specimen => createHash('sha256').update(JSON.stringify([
  specimen.id,
  specimen.status,
  specimen.kind,
  specimen.barId ?? null,
  specimen.spinnerId ?? null,
  specimen.filledCells ?? null,
  specimen.emptyCells ?? null,
  specimen.elapsed ?? null,
  specimen.padCells ?? 0,
  specimen.label,
  specimen.tone
])).digest('hex');

const blockIdPrefixes = ['BLK', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((prefix, index) => index === 0 ? prefix : `BK${prefix}`);

export function nextBlockRuleId(usedIds) {
  for (const prefix of blockIdPrefixes) {
    for (let number = 1; number <= 999; number += 1) {
      const id = `R-${prefix}-${String(number).padStart(3, '0')}`;
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
  }
  throw new Error('stable section-block ID namespaces are exhausted');
}

// Reconcile by exact retained content, never by position. Reordering therefore
// preserves IDs, while an edit receives a new ID and leaves the old record
// addressable. A stored digest mismatch is corruption, not an invitation to
// reuse the ID for different content.
export function reconcileSectionBlockIdentities({ sectionKey, fragments, priorBlocks, usedIds }) {
  const byDigest = new Map();
  for (const block of priorBlocks.filter(item => item.sectionKey === sectionKey)) {
    if (!isBlockRuleId(block.id)) throw new Error(`invalid stable block id ${block.id}`);
    const actual = blockContentDigest(block.renderHtml);
    if (block.contentDigest !== actual) throw new Error(`${block.id} content digest drifted`);
    const queue = byDigest.get(actual) ?? [];
    queue.push(block);
    byDigest.set(actual, queue);
  }
  for (const queue of byDigest.values()) queue.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  return fragments.map(renderHtml => {
    const contentDigest = blockContentDigest(renderHtml);
    const prior = byDigest.get(contentDigest)?.shift();
    return { id: prior?.id ?? nextBlockRuleId(usedIds), contentDigest, renderHtml, prior };
  });
}

/**
 * A mark's domains and every domain that contains them.
 *
 * **The containment is data on the registry, not a branch here.** `row-lead` and
 * `inline` are both inside `content-row` because a row shows its lead and its
 * separators together; a rule written as *these two names also clash* is a rule
 * that grows a clause per pair.
 */
export function closureOf(registry, domains) {
  const table = registry.collisionDomains ?? {};
  const out = new Set(domains ?? []);
  for (const [name, record] of Object.entries(table)) {
    for (const inner of record.contains ?? []) if (out.has(inner)) out.add(name);
  }
  return out;
}

export function validateRuleRecords(ruleList) {
  const ids = new Set();
  const legacyIds = new Set();
  const rules = new Map();
  for (const rule of ruleList) {
    if (!RULE_ID.test(rule.id)) throw new Error(`invalid stable rule id ${rule.id}`);
    if (ids.has(rule.id)) throw new Error(`duplicate stable rule id ${rule.id}`);
    if (!STATUSES.has(rule.status)) throw new Error(`${rule.id} has invalid status ${rule.status}`);
    if (typeof rule.title !== 'string' || !rule.title.trim()) throw new Error(`${rule.id} has no title`);
    if (typeof rule.text !== 'string' || !rule.text.trim()) throw new Error(`${rule.id} has no normative text`);
    if (!Array.isArray(rule.supersedes)) throw new Error(`${rule.id} has no supersedes array`);
    if (rule.contentDigest !== ruleContentDigest(rule)) throw new Error(`${rule.id} immutable rule content drifted`);
    ids.add(rule.id);
    rules.set(rule.id, rule);
    for (const legacyId of rule.legacyIds ?? []) {
      if (legacyIds.has(legacyId)) throw new Error(`duplicate legacy rule alias ${legacyId}`);
      legacyIds.add(legacyId);
    }
  }
  for (const rule of ruleList) {
    if (rule.status === 'superseded') {
      if (!rule.supersededBy) throw new Error(`${rule.id} is superseded without a successor`);
      // **A successor may itself be superseded.** The check read `successor.status
      // !== 'current'`, which forbade chains outright — and a chain is the only
      // move left once a rule's own links are sealed: a released rule's
      // supersededBy cannot be redirected (lint-immutable), so a rule that
      // narrows a narrowing has nowhere to attach but the end of the line. What
      // must hold is not the first link's status but the **terminus**: follow the
      // chain and it ends in exactly one current rule.
      //
      // The walk does all four things at once, because each is a way the chain
      // can fail to have one terminus — a link that resolves to nothing, a link
      // the target does not acknowledge, a link that returns to a rule already
      // walked, and an end that is not current.
      const walked = new Set([rule.id]);
      let cursor = rule;
      while (cursor.supersededBy) {
        const next = rules.get(cursor.supersededBy);
        if (!next) throw new Error(`${cursor.id} has invalid successor ${cursor.supersededBy}`);
        if (!next.supersedes?.includes(cursor.id)) throw new Error(`${cursor.id} / ${next.id} supersession is not reciprocal`);
        if (walked.has(next.id)) throw new Error(`supersession cycle at ${next.id}`);
        walked.add(next.id);
        cursor = next;
      }
      if (cursor.status !== 'current') {
        throw new Error(`${rule.id}'s supersession chain ends at ${cursor.id}, which is ${cursor.status} and has no successor`);
      }
    }
    for (const oldId of rule.supersedes ?? []) {
      const old = rules.get(oldId);
      if (!old || old.supersededBy !== rule.id) throw new Error(`${rule.id} has asymmetric supersedes link to ${oldId}`);
    }
    // **And the cycle walk stays for the rules the chain check does not start
    // from.** A `current` or `example` rule carrying a `supersededBy` is not
    // superseded, so the branch above never sees it; without this it could point
    // into a loop and nothing would say so. Null-safe, because a dangling link
    // here is a dangling link and not a TypeError.
    const seen = new Set([rule.id]);
    let cursor = rule;
    while (cursor?.supersededBy) {
      if (seen.has(cursor.supersededBy)) throw new Error(`supersession cycle at ${cursor.supersededBy}`);
      seen.add(cursor.supersededBy);
      cursor = rules.get(cursor.supersededBy);
      if (!cursor) throw new Error(`dangling supersededBy link from ${rule.id}`);
    }
  }
  return rules;
}

export function loadRegistry() {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

const atPath = (root, path) => path.split('.').reduce((value, part) => value?.[part], root);
const active = items => items.filter(item => typeof item !== 'object' || item === null || !('status' in item) || item.status === 'current');

function fitAsciiTrajectory(pattern, frameCount) {
  return Array.from({ length: frameCount }, (_, index) => pattern[Math.floor((index * pattern.length) / frameCount)]);
}

export function spinnerAsciiFrames(registry, spinner, seen = new Set()) {
  if (seen.has(spinner.id)) throw new Error(`spinner ASCII trajectory cycle at ${spinner.id}`);
  if (spinner.asciiTrajectory?.type === 'fit-cycle') return fitAsciiTrajectory(spinner.asciiPattern, spinner.frames.length);
  if (spinner.asciiTrajectory?.type === 'composite') {
    const nextSeen = new Set(seen).add(spinner.id);
    return spinner.asciiTrajectory.spinnerIds.flatMap(id => {
      const source = active(registry.spinners).find(item => item.id === id);
      if (!source) throw new Error(`${spinner.id} cites missing ASCII trajectory source ${id}`);
      return spinnerAsciiFrames(registry, source, nextSeen);
    });
  }
  throw new Error(`${spinner.id} has unknown ASCII trajectory ${spinner.asciiTrajectory?.type}`);
}

export function collectionFor(registry, key) {
  const source = registry.countSources[key];
  if (!source) throw new Error(`unknown count source ${key}`);
  const collection = atPath(registry, source.collection);
  if (!Array.isArray(collection)) throw new Error(`count source ${key} does not resolve to an array`);
  const statusScoped = source.statuses
    ? collection.filter(item => source.statuses.includes(item?.status))
    : active(collection);
  const exactScoped = statusScoped.filter(item => !source.where || Object.entries(source.where).every(([field, value]) => item?.[field] === value));
  return exactScoped.filter(item => !source.range || Object.entries(source.range).every(([field, limits]) => {
    if (!limits || typeof limits !== 'object' || (typeof limits.min !== 'number' && typeof limits.max !== 'number')) {
      throw new Error(`count source ${key} has no numeric bound for ${field}`);
    }
    if (typeof limits.min === 'number' && typeof limits.max === 'number' && limits.min > limits.max) {
      throw new Error(`count source ${key} has an inverted range for ${field}`);
    }
    const value = item?.[field];
    if (typeof value !== 'number') return false;
    if (typeof limits?.min === 'number' && value < limits.min) return false;
    if (typeof limits?.max === 'number' && value > limits.max) return false;
    return true;
  }));
}

function assertCurrentCitations(registry, owner, ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error(`${owner} has no rule citation`);
  const rules = new Map(registry.rules.map(rule => [rule.id, rule]));
  for (const id of ids) {
    const cited = rules.get(id);
    if (!cited) throw new Error(`${owner} cites missing ${id}`);
    if (cited.status !== 'current') throw new Error(`${owner} cites non-current ${id}`);
  }
}

export function validateRegistry(registry) {
  const rules = validateRuleRecords(registry.rules);

  for (const [name, source] of Object.entries(registry.countSources)) {
    const items = collectionFor(registry, name);
    if (!items.length) throw new Error(`count source ${name} is empty`);
    assertCurrentCitations(registry, `count source ${name}`, source.ruleIds);
  }
  // A CURRENT RECORD MUST CITE. `!('ruleIds' in item) -> continue` meant a record
  // could opt out of citation validation by omitting the field, which is exactly
  // the case the check exists for. The only legitimate exemption is `rules`
  // themselves: a rule IS the citation and does not cite itself.
  const CITATION_EXEMPT = new Set(['rules']);
  // STATUS IS MANDATORY. active() treats a missing status as current, while the
  // citation walk only inspects status === 'current' \u2014 so deleting the field
  // rendered a record AND exempted it from every check.
  const STATUSES = new Set(['current', 'superseded', 'example', 'exploratory']);
  const walkForStatus = (node, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 3) return;
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
          if (!item || typeof item !== 'object') continue;
          if (!('id' in item) && !('ruleIds' in item) && !('status' in item)) continue;
          if (!('status' in item)) throw new Error(`${here}[${index}] has no status`);
          if (!STATUSES.has(item.status))
            throw new Error(`${here}[${index}] has invalid status '${item.status}'`);
        }
        // stable-ID uniqueness across EVERY status, not just current
        const ids = value.filter(x => x && typeof x === 'object' && x.id).map(x => x.id);
        const dup = ids.find((x, i) => ids.indexOf(x) !== i);
        if (dup) throw new Error(`${here} has duplicate id '${dup}' across statuses`);
      } else if (value && typeof value === 'object' && depth < 3) {
        walkForStatus(value, here, depth + 1);
      }
    }
  };
  walkForStatus(registry, '', 0);
  const walkForCitations = (node, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 3) return;
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (Array.isArray(value)) {
        if (CITATION_EXEMPT.has(here)) continue;
        for (const [index, item] of value.entries()) {
          if (!item || typeof item !== 'object' || item.status !== 'current') continue;
          if (!('ruleIds' in item)) {
            throw new Error(`${here}[${index}] is current and cites no rule`);
          }
          assertCurrentCitations(registry, `${here}[${index}]`, item.ruleIds);
        }
      } else if (value && typeof value === 'object' && depth < 3) {
        walkForCitations(value, here, depth + 1);   // NESTED collections too
      }
    }
  };
  walkForCitations(registry, '', 0);
  const currentSpinners = active(registry.spinners);
  const spinnerIds = new Set();
  for (const spinner of currentSpinners) {
    if (spinnerIds.has(spinner.id)) throw new Error(`duplicate spinner id ${spinner.id}`);
    spinnerIds.add(spinner.id);
    assertCurrentCitations(registry, `spinner ${spinner.id}`, spinner.ruleIds);
    if (spinner.reservedCells !== 1) throw new Error(`${spinner.id} must reserve exactly one cell`);
    if (spinner.capabilityPolicy !== 'unicode-narrow-or-ascii') throw new Error(`${spinner.id} lacks a one-cell capability policy`);
    if (spinner.frameWidthByCapability?.unicodeNarrow !== 1 || spinner.frameWidthByCapability?.ascii !== 1) {
      throw new Error(`${spinner.id} has an invalid frame-width declaration`);
    }
    if (!Array.isArray(spinner.frames) || !spinner.frames.length || spinner.frames.some(frame => [...frame].length !== 1)) {
      throw new Error(`${spinner.id} has a Unicode frame that is not one code point`);
    }
    if (spinner.initial !== spinner.frames[0]) throw new Error(`${spinner.id} initial glyph differs from its first frame`);
    if ('asciiFrames' in spinner || 'asciiInitial' in spinner) {
      throw new Error(`${spinner.id} stores derived ASCII frames instead of one semantic pattern`);
    }
    if (spinner.asciiTrajectory?.type === 'fit-cycle') {
      if (!Array.isArray(spinner.asciiPattern) || !spinner.asciiPattern.length || spinner.asciiPattern.length > spinner.frames.length) {
        throw new Error(`${spinner.id} lacks a usable semantic ASCII pattern`);
      }
      if (spinner.asciiPattern.some(frame => !/^[\x21-\x7e]$/.test(frame))) {
        throw new Error(`${spinner.id} has a non-one-cell ASCII pattern frame`);
      }
    } else if (spinner.asciiTrajectory?.type === 'composite') {
      if ('asciiPattern' in spinner) throw new Error(`${spinner.id} stores a competing pattern beside its composite trajectory`);
      const sources = spinner.asciiTrajectory.spinnerIds;
      if (!Array.isArray(sources) || !sources.length || new Set(sources).size !== sources.length) {
        throw new Error(`${spinner.id} has an invalid composite ASCII trajectory`);
      }
      for (const id of sources) {
        const source = currentSpinners.find(item => item.id === id);
        if (!source || source.asciiTrajectory?.type !== 'fit-cycle') throw new Error(`${spinner.id} has invalid ASCII trajectory source ${id}`);
      }
    } else {
      throw new Error(`${spinner.id} lacks a declared ASCII trajectory`);
    }
    if (typeof spinner.asciiMotion !== 'string' || !spinner.asciiMotion.trim()) throw new Error(`${spinner.id} lacks ASCII motion semantics`);
    const asciiFrames = spinnerAsciiFrames(registry, spinner);
    if (asciiFrames.length !== spinner.frames.length) throw new Error(`${spinner.id} ASCII rung does not preserve frame count`);
    if (asciiFrames.some(frame => !/^[\x21-\x7e]$/.test(frame))) throw new Error(`${spinner.id} resolves a non-one-cell ASCII frame`);
    if (spinner.cycleMs !== spinner.intervalMs * spinner.frames.length) {
      throw new Error(`${spinner.id} cycle does not equal interval × frame count`);
    }
    if (registry.shell.baseCss.includes(`@keyframes ${spinner.keyframe}`) || registry.shell.baseCss.includes(`.sp-${spinner.id}::after`)) {
      throw new Error(`${spinner.id} CSS is duplicated outside the generated spinner compiler`);
    }
  }
  for (const section of registry.sections) {
    const example = rules.get(section.recordId);
    if (!example || example.status !== 'example') throw new Error(`section ${section.key} lacks its retained example record`);
    if (!section.ruleIds?.length) throw new Error(`section ${section.key} has no citations`);
    assertCurrentCitations(registry, `section ${section.key}`, section.ruleIds);
    if (section.ruleIds.some(id => id.startsWith('R-SEC-'))) throw new Error(`${section.key} still cites a section-wide umbrella`);
    if (section.ruleSetKey) {
      const items = atPath(registry, section.ruleSetKey);
      if (!Array.isArray(items) || items.length < 2) throw new Error(`${section.key} has an invalid atomic rule set`);
      const itemIds = new Set();
      const requiredIds = new Set();
      for (const item of items) {
        if (!item || item.status !== 'current' || !item.id || !item.heading || !Array.isArray(item.ruleIds) || item.ruleIds.length !== 1) {
          throw new Error(`${section.key} has a malformed atomic rule-set item`);
        }
        if (itemIds.has(item.id)) throw new Error(`${section.key} repeats atomic item ${item.id}`);
        itemIds.add(item.id);
        assertCurrentCitations(registry, `${section.key}.${item.id}`, item.ruleIds);
        requiredIds.add(item.ruleIds[0]);
      }
      if (requiredIds.size !== items.length) throw new Error(`${section.key} shares one rule ID across independent normative items`);
      for (const id of requiredIds) {
        if (!section.ruleIds.includes(id)) throw new Error(`${section.key} omits atomic citation ${id}`);
      }
    }
  }
  for (const rule of registry.rules.filter(item => item.id.startsWith('R-SEC-'))) {
    if (rule.status !== 'superseded') throw new Error(`${rule.id} remains a section-wide normative umbrella`);
    if (!registry.sections.some(section => section.key === rule.sectionKey)) throw new Error(`${rule.id} points to missing section ${rule.sectionKey}`);
  }

  if (!Array.isArray(registry.sectionBlocks) || !registry.sectionBlocks.length) {
    throw new Error('stable section block registry is missing');
  }
  const blocksById = new Map();
  const referencedBlockIds = new Set();
  for (const block of registry.sectionBlocks) {
    if (!isBlockRuleId(block.id) || blocksById.has(block.id)) throw new Error(`invalid or duplicate block record ${block.id}`);
    if (!Number.isInteger(block.position) || block.position < 1) throw new Error(`${block.id} has invalid position`);
    if (block.status !== 'example') throw new Error(`${block.id} specimen block must have example status`);
    if (typeof block.renderHtml !== 'string' || !block.renderHtml.length) throw new Error(`${block.id} lacks retained render content`);
    if (block.contentDigest !== blockContentDigest(block.renderHtml)) throw new Error(`${block.id} content digest drifted`);
    const retainedText = plainBlockText(block.renderHtml);
    const expectedText = retainedText || 'Retained blank-cell specimen.';
    if (expectedText !== block.text) throw new Error(`${block.id} text drifted from its retained render content`);
    const rule = rules.get(block.id);
    if (!rule || rule.status !== block.status || rule.text !== block.text || rule.sectionKey !== block.sectionKey) {
      throw new Error(`${block.id} and its stable rule record disagree`);
    }
    if (!Array.isArray(block.ruleIds) || block.ruleIds.length !== 1 || block.ruleIds[0] !== block.id) {
      throw new Error(`${block.id} must cite its own retained example record`);
    }
    blocksById.set(block.id, block);
  }
  for (const section of registry.sections.filter(item => !item.renderer)) {
    if ('contentHtml' in section) throw new Error(`${section.key} retains opaque contentHtml`);
    if (!Array.isArray(section.blockIds) || !section.blockIds.length) throw new Error(`${section.key} has no structured block projection`);
    if (section.sourceBlockCount !== section.blockIds.length) throw new Error(`${section.key} block-count retention check failed`);
    const blocks = section.blockIds.map((id, index) => {
      const block = blocksById.get(id);
      if (!block || block.sectionKey !== section.key || block.position !== index + 1) throw new Error(`${section.key} has invalid ordered block ${id}`);
      if (referencedBlockIds.has(id)) throw new Error(`${id} is projected by more than one section`);
      referencedBlockIds.add(id);
      return block;
    });
    const retainedSource = blocks.map(block => block.renderHtml).join(BLOCK_GAP);
    const digest = createHash('sha256').update(retainedSource).digest('hex');
    if (digest !== section.sourceDigest) throw new Error(`${section.key} retained-content digest changed`);
    if (section.ruleIds.some(isBlockRuleId)) throw new Error(`${section.key} treats a retained specimen block as normative authority`);
  }
  if (referencedBlockIds.size !== registry.sectionBlocks.length) throw new Error('an unreferenced retained section block exists');

  const sectionKeys = new Set(registry.sections.map(section => section.key));
  for (const primitive of active(registry.primitives)) {
    if (!Array.isArray(primitive.definedIn) || !primitive.definedIn.length) throw new Error(`${primitive.id} lacks canonical definition links`);
    if (primitive.definedIn.some(key => !sectionKeys.has(key))) throw new Error(`${primitive.id} points to a missing canonical section`);
    if (!primitive.ruleIds.includes('R-PRI-002')) throw new Error(`${primitive.id} omits definition-mapping rule`);
  }
  if (!registry.spinnerPolicy?.previewDefault || !registry.spinnerPolicy?.previewDefaultSource || !registry.spinnerPolicy?.measuredQuery) {
    throw new Error('spinner preview policy is incomplete');
  }
  if (!registry.barPolicy?.indeterminate || !Array.isArray(registry.barPolicy.placementOrder)) throw new Error('bar placement policy is incomplete');
  const currentBars = active(registry.bars);
  const currentBarIds = currentBars.map(bar => bar.id);
  if (JSON.stringify(registry.barPolicy.placementOrder) !== JSON.stringify(currentBarIds)) {
    throw new Error('bar placement projection must include every current bar exactly once in registry order');
  }
  for (const bar of currentBars) {
    if (typeof bar.placement !== 'string' || !bar.placement.trim()) throw new Error(`${bar.id} lacks a placement`);
    if (!bar.ruleIds.includes('R-PRG-002')) throw new Error(`${bar.id} omits placement rule`);
  }
  const gallery = registry.barPolicy.gallerySample;
  if (!gallery || gallery.width !== gallery.filledCells + gallery.emptyCells || Math.round(gallery.value * gallery.width) !== gallery.filledCells) {
    throw new Error('bar gallery sample does not match its registered quantity');
  }
  if (!Array.isArray(registry.barPolicy.primaryPlacementIds) || registry.barPolicy.primaryPlacementIds.some(id => !currentBarIds.includes(id))) {
    throw new Error('bar primary placement IDs are invalid');
  }
  if (!Array.isArray(registry.barSpecimens) || registry.barSpecimens.length !== 5) throw new Error('bar placement specimens are incomplete');
  const specimenIds = new Set();
  for (const specimen of registry.barSpecimens) {
    if (specimenIds.has(specimen.id) || specimen.status !== 'example' || specimen.contentDigest !== barSpecimenContentDigest(specimen)) {
      throw new Error(`${specimen.id} bar specimen is invalid`);
    }
    if (specimen.kind === 'bar' && !currentBarIds.includes(specimen.barId)) throw new Error(`${specimen.id} points to a missing bar alphabet`);
    if (specimen.kind === 'spinner' && !active(registry.spinners).some(item => item.id === specimen.spinnerId)) throw new Error(`${specimen.id} points to a missing spinner`);
    specimenIds.add(specimen.id);
  }
  if (!registry.rampPolicy?.direction || !registry.rampPolicy?.meaning || !registry.rampPolicy?.lowColour) throw new Error('ramp policy is incomplete');
  const rampIds = new Set(active(registry.ramps).map(ramp => ramp.id));
  for (const ramp of active(registry.ramps)) {
    for (const field of ['meaning', 'semantic', 'direction', 'attentionGroup', 'tone', 'cssClass', 'specimenText', 'galleryGroup']) {
      if (typeof ramp[field] !== 'string' || !ramp[field].trim()) throw new Error(`${ramp.id} lacks ${field}`);
    }
    if (!Number.isInteger(ramp.galleryOrder)) throw new Error(`${ramp.id} lacks galleryOrder`);
    if (!ramp.ruleIds.includes('R-MOT-012')) throw new Error(`${ramp.id} omits ramp-semantics rule`);
  }
  for (const [group, memberIds] of Object.entries(registry.rampPolicy.attentionGroups ?? {})) {
    if (!memberIds.length || memberIds.some(id => !rampIds.has(id))) throw new Error(`ramp attention group ${group} is invalid`);
  }
  const keymapPolicyFields = ['universal', 'deliberateChanges', 'platformConventions', 'ownedChordRationale', 'help'];
  for (const field of keymapPolicyFields) if (!registry.keymapPolicy?.[field]) throw new Error(`keymap policy lacks ${field}`);
  for (const field of ['durableEntry', 'currentScopeFirst', 'grouping', 'generatedCoverage', 'docsTarget', 'docsContract']) {
    if (!registry.keymapPolicy.help[field]) throw new Error(`help policy lacks ${field}`);
  }
  const currentScopeFirst = registry.keymapPolicy.help.currentScopeFirst;
  if (currentScopeFirst.required !== true || typeof currentScopeFirst.exampleScope !== 'string' || !currentScopeFirst.exampleScope || typeof currentScopeFirst.description !== 'string' || !currentScopeFirst.description) {
    throw new Error('help current-scope-first policy is malformed');
  }
  if (!active(registry.bindings).some(binding => binding.scope === currentScopeFirst.exampleScope)) {
    throw new Error(`help example current scope ${currentScopeFirst.exampleScope} has no bindings`);
  }
  const retainedProjectionFacets = {
    primitives: ['definition', 'definedIn'], bars: ['placement', 'indeterminate'],
    ramps: ['meaning', 'semantic', 'direction', 'attentionGroup'],
    keymap: ['universal', 'deliberateChanges', 'platformConventions', 'ownedChordRationale'],
    help: ['durableEntry', 'currentScopeFirst', 'grouping', 'generatedCoverage', 'docsTarget', 'docsContract'],
    glyphs: ['reservedCells', 'unicodeMeasured', 'asciiMeasured', 'followingColumnAligned']
  };
  for (const [renderer, facets] of Object.entries(retainedProjectionFacets)) {
    if (JSON.stringify(registry.projectionRetention?.[renderer]) !== JSON.stringify(facets)) {
      throw new Error(`${renderer} projection lost a retained feature facet`);
    }
  }

  const assertStateLines = (owner, lines) => {
    if (!Array.isArray(lines) || !lines.length || lines.some(line => typeof line !== 'string' || !line.trim())) {
      throw new Error(`${owner} must be a non-empty array of text lines`);
    }
  };
  if (JSON.stringify(registry.catalogues.componentFacts) !== JSON.stringify(STATE_FACT_KEYS)) {
    throw new Error(`componentFacts must be exactly ${STATE_FACT_KEYS.join(', ')}`);
  }
  if (!Array.isArray(registry.stateTableGroups) || !registry.stateTableGroups.length) {
    throw new Error('stateTableGroups is missing');
  }
  const stateRenderers = new Set();
  const stateComponentIds = new Set();
  for (const group of registry.stateTableGroups) {
    if (!group || typeof group !== 'object' || typeof group.renderer !== 'string' || !group.renderer) {
      throw new Error('state table group lacks a renderer');
    }
    if (stateRenderers.has(group.renderer)) throw new Error(`duplicate state table renderer ${group.renderer}`);
    stateRenderers.add(group.renderer);
    if ('introHtml' in group) throw new Error(`${group.renderer} retains opaque introHtml`);
    if (!group.intro || typeof group.intro !== 'object') throw new Error(`${group.renderer} lacks structured intro data`);
    assertStateLines(`${group.renderer} intro summary`, group.intro.summaryLines);
    if (!group.intro.factDefinitions || typeof group.intro.factDefinitions !== 'object' || Array.isArray(group.intro.factDefinitions)) {
      throw new Error(`${group.renderer} factDefinitions must be an object`);
    }
    const definitionKeys = Object.keys(group.intro.factDefinitions);
    if (definitionKeys.length) {
      if (definitionKeys.length !== STATE_FACT_KEYS.length || STATE_FACT_KEYS.some(key => !definitionKeys.includes(key))) {
        throw new Error(`${group.renderer} has a partial fact-definition schema`);
      }
      for (const key of STATE_FACT_KEYS) assertStateLines(`${group.renderer} definition ${key}`, group.intro.factDefinitions[key]);
    }
    for (const [where, notes] of [['intro', group.intro.notes], ['group', group.notes]]) {
      if (!Array.isArray(notes)) throw new Error(`${group.renderer} ${where} notes must be an array`);
      for (const [index, note] of notes.entries()) {
        if (!note || !['paragraph', 'callout'].includes(note.kind)) throw new Error(`${group.renderer} ${where} note ${index} has an invalid kind`);
        assertStateLines(`${group.renderer} ${where} note ${index}`, note.lines);
      }
    }
    if (!Array.isArray(group.components) || !group.components.length) throw new Error(`${group.renderer} has no components`);
    for (const component of group.components) {
      if (!component || typeof component !== 'object' || !component.id || !component.title) throw new Error(`${group.renderer} has an invalid component`);
      if (stateComponentIds.has(component.id)) throw new Error(`duplicate state-table component ${component.id}`);
      stateComponentIds.add(component.id);
      if ('html' in component) throw new Error(`${component.id} retains opaque state-table HTML`);
      if (component.status !== 'current') throw new Error(`${component.id} is not current`);
      assertCurrentCitations(registry, `state-table component ${component.id}`, component.ruleIds);
      if (!component.facts || typeof component.facts !== 'object' || Array.isArray(component.facts)) {
        throw new Error(`${component.id} lacks a structured facts object`);
      }
      const factKeys = Object.keys(component.facts);
      if (factKeys.length !== STATE_FACT_KEYS.length || STATE_FACT_KEYS.some(key => !factKeys.includes(key))) {
        throw new Error(`${component.id} must define exactly the seven canonical facts`);
      }
      for (const key of STATE_FACT_KEYS) assertStateLines(`${component.id}.${key}`, component.facts[key]);
      if (!Array.isArray(component.extensionRows)) throw new Error(`${component.id} extensionRows must be an array`);
      const extensionKeys = new Set();
      for (const extension of component.extensionRows) {
        if (!extension?.key || !extension.label || !STATE_FACT_KEYS.includes(extension.after)) {
          throw new Error(`${component.id} has an invalid extension row`);
        }
        if (extensionKeys.has(extension.key)) throw new Error(`${component.id} repeats extension ${extension.key}`);
        extensionKeys.add(extension.key);
        assertStateLines(`${component.id} extension ${extension.key}`, extension.lines);
      }
    }
  }

  const seen = [];
  const deferred = [];
  for (const glyph of [...registry.glyphs, ...registry.delimiters]) {
    assertCurrentCitations(registry, `glyph ${glyph.id}`, glyph.ruleIds);
    const deferring = glyph.asciiResolution !== undefined;
    if (deferring && glyph.widthByCapability === undefined) {
      throw new Error(`${glyph.id}: a state-resolved ASCII half must still declare widthByCapability`);
    }
    const widths = glyph.widthByCapability ?? { unicode: 1, ascii: [...glyph.ascii].length };
    const widest = Math.max(...Object.values(widths));
    if (glyph.reservedCells < widest) throw new Error(`${glyph.id} reserves ${glyph.reservedCells} cells but needs ${widest}`);
    // **Uniqueness inside a domain, not across the screen.** A global check
    // spends the ASCII alphabet on marks a reader never meets together: the sort
    // pair lives on a table's header row, disclosure in a content row's lead, and
    // both may take `v` because no row shows the two in the same role. What the
    // domain model does *not* let through is the case that looks the same from
    // outside — a lead mark and an inline separator are on one row, so `row-lead`
    // and `inline` are inside `content-row` and a `:` in both is a clash.
    //
    // **A mark whose ASCII half is resolved by state holds no character**, so it
    // is not in the comparison at all — the head mark is one glyph above 1-bit
    // and a set of them below it, and pinning `o` to the record would spend a
    // character the monochrome rung does not use. It is *excluded and counted*,
    // never silently skipped: the exclusion must say which rung resolves it, or
    // the field is an escape hatch with no reader.
    if (deferring) {
      if (glyph.asciiResolution !== 'state') throw new Error(`${glyph.id}: unknown asciiResolution ${glyph.asciiResolution}`);
      if (typeof glyph.asciiResolutionNote !== 'string' || glyph.asciiResolutionNote === '') {
        throw new Error(`${glyph.id}: asciiResolution must name the rung that resolves it`);
      }
      deferred.push(glyph.id);
      continue;
    }
    const mine = closureOf(registry, glyph.collisionDomains);
    for (const other of seen) {
      if (other.ascii !== glyph.ascii) continue;
      const shared = [...closureOf(registry, other.collisionDomains)].filter(d => mine.has(d));
      if (shared.length === 0) continue;
      throw new Error(`ASCII collision: ${glyph.id} and ${other.id} both resolve to ${glyph.ascii} in ${shared.join(", ")}`);
    }
    seen.push(glyph);
    const unicodeSolved = widths.unicode + (glyph.reservedCells - widths.unicode);
    const asciiSolved = widths.ascii + (glyph.reservedCells - widths.ascii);
    if (unicodeSolved !== asciiSolved) throw new Error(`${glyph.id} shifts the solved column across capability tiers`);
  }
  // **The vacuity control.** Every record deferring its ASCII half would leave
  // the comparison empty and passing, which is the shape A03 §2 is about.
  if (seen.length === 0) throw new Error('no glyph carried an ASCII half — an empty comparison passes, which is not a check');
  return registry;
}

const smallWords = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
function numberWord(value) {
  if (value < 20) return smallWords[value];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (value < 100) return value % 10 ? `${tens[Math.floor(value / 10)]}-${smallWords[value % 10]}` : tens[Math.floor(value / 10)];
  return String(value);
}
const cap = value => value.charAt(0).toUpperCase() + value.slice(1);

function refs(ids) {
  return ids.map(id => `<a class="rule-ref" href="#${id}">${id}</a>`).join(' ');
}

function countValue(registry, key, format = 'number', casing = 'lower') {
  const value = collectionFor(registry, key).length;
  let visible = format === 'word' ? numberWord(value) : String(value);
  if (casing === 'upper') visible = visible.toUpperCase();
  if (casing === 'cap') visible = cap(visible);
  const citations = registry.countSources[key].ruleIds.join(' ');
  return `<span class="generated-count" data-count-provenance="registry" data-count-key="${esc(key)}" data-count-value="${value}" data-count-format="${esc(format)}" data-count-casing="${esc(casing)}" data-rule-ids="${esc(citations)}">${visible}</span>`;
}

function countClaim(registry, key, noun, format = 'word', casing = 'lower') {
  return `${countValue(registry, key, format, casing)} ${noun} <span class="rule-ref">[${refs(registry.countSources[key].ruleIds)}]</span>`;
}

function generatedClaims(registry, value) {
  const replacements = [
    ['two independent carriers', `${countValue(registry, 'distinctionCarriers', 'word')} independent carriers`],
    ['has three tones', `has ${countValue(registry, 'entrySemanticTones', 'word')} tones`],
    ['one cell still paints one ground', `${countValue(registry, 'cellGrounds', 'word')} cell still paints ${countValue(registry, 'cellGrounds', 'word')} ground`],
    ['Two persistent peer regions', `${countValue(registry, 'splitPeerRegions', 'word', 'cap')} persistent peer regions`],
    ['two levels, never three', `${countValue(registry, 'hierarchyLevels', 'word')} levels, never three`],
    ['three things carry the state', `${countValue(registry, 'queueStateCarriers', 'word')} things carry the state`],
    ['three facts and two affordances', `${countValue(registry, 'emptyScreenFacts', 'word')} facts and ${countValue(registry, 'emptyScreenAffordances', 'word')} affordances`],
    ['three rungs, detected not assumed', `${countValue(registry, 'notificationRungs', 'word')} rungs, detected not assumed`],
    ['three presentations that compose', `${countValue(registry, 'focusPresentations', 'word')} presentations that compose`],
    ['four grounds, four jobs', `${countValue(registry, 'surfaceGroundJobs', 'word')} grounds, ${countValue(registry, 'surfaceGroundJobs', 'word')} jobs`],
    ['three plots in a mosaic', `${countValue(registry, 'mosaicPlots', 'word')} plots in a mosaic`],
    ['two bars is legal when they are two documents', `${countValue(registry, 'peerDocumentBars', 'word')} bars is legal when they are ${countValue(registry, 'peerDocumentBars', 'word')} documents`],
    ['two facts, two carriers', `${countValue(registry, 'streamingFacts', 'word')} facts, ${countValue(registry, 'streamingFacts', 'word')} carriers`],
    ['two things a terminal CANNOT do', `${countValue(registry, 'terminalMotionImpossibilities', 'word')} things a terminal CANNOT do`],
    ['two ways a character fails', `${countValue(registry, 'glyphWidthFailureModes', 'word')} ways a character fails`],
    ['three ramps that work on a fill', `${countValue(registry, 'fillRamps', 'word')} ramps that work on a fill`],
    ['four consumers, one mechanism', `${countValue(registry, 'spanConsumers', 'word')} consumers, one mechanism`],
    ['three layouts across four uses', `${countValue(registry, 'questionLayouts', 'word')} layouts across ${countValue(registry, 'questionUses', 'word')} uses`],
    ['four inherited rules', `${countValue(registry, 'approvalInheritedRules', 'word')} inherited rules`],
    ['four kinds, and what OPEN means', `${countValue(registry, 'linkKinds', 'word')} kinds, and what OPEN means`],
    ['two questions: where are they all, and which one am I on', `${countValue(registry, 'findQuestions', 'word')} questions: where are they all, and which one am I on`],
    ['three framework budgets', `${countValue(registry, 'frameworkBudgets', 'word')} framework budgets`],
    ['four model failures, four answers', `${countValue(registry, 'modelFailureKinds', 'word')} model failures, ${countValue(registry, 'modelFailureKinds', 'word')} answers`],
    ['two rules that survive', `${countValue(registry, 'projectIdentityRules', 'word')} rules that survive`],
    ['four sources, and the tone is the ladder', `${countValue(registry, 'configurationSources', 'word')} sources, and the tone is the ladder`],
    ['three things it needs', `${countValue(registry, 'syntaxRequirements', 'word')} things it needs`],
    ['nine rules doing their job at once', `${countValue(registry, 'integratedRepairRules', 'word')} rules doing their job at once`],
    ['three surfaces, and a push is not one of them', `${countValue(registry, 'subagentSurfaces', 'word')} surfaces, and a push is not one of them`],
    ['three things break at once', `${countValue(registry, 'prismFailureModes', 'word')} things break at once`],
    ['five rows, not a dashboard', `${countValue(registry, 'runEntryRows', 'word')} rows, not a dashboard`],
    ['still five rows', `still ${countValue(registry, 'runEntryRows', 'word')} rows`],
    ['TWO TARGET CLASSES', `${countValue(registry, 'pointerTargetClasses', 'word', 'upper')} TARGET CLASSES`],
    ['six namespaces', `${countValue(registry, 'semanticNamespaces', 'word')} namespaces`],
    ['three semantic tones', `${countValue(registry, 'entrySemanticTones', 'word')} semantic tones`],
    ['two cells that were BLANK', `${countValue(registry, 'stateTableHolesA', 'word')} cells that were BLANK`],
    ['three more blank cells', `${countValue(registry, 'stateTableHolesB', 'word')} more blank cells`],
    ['two rules make the shedding honest', `${countValue(registry, 'tapeSheddingRules', 'word')} rules make the shedding honest`],
    ['three containers', `${countValue(registry, 'statusContainers', 'word')} containers`],
    ['nine combinations', `${countValue(registry, 'statusCombinations', 'word')} combinations`],
    ['one status() function', `${countValue(registry, 'statusFunctions', 'word')} status() function`],
    ['three shapes, three names, one layer order', `${countValue(registry, 'transientShapes', 'word')} shapes, ${countValue(registry, 'transientShapes', 'word')} names, ${countValue(registry, 'transientLayerOrders', 'word')} layer order`],
    ['four moments, and the draft survives', `${countValue(registry, 'ownershipTransitionMoments', 'word')} moments, and the draft survives`],
    ['the semantic tree has two renderings', `the semantic tree has ${countValue(registry, 'semanticRenderings', 'word')} renderings`],
    ['Four sections disagreed', `${countValue(registry, 'disagreementSections', 'word', 'cap')} sections disagreed`],
    ['TWO RULES is what says it is a panel', `${countValue(registry, 'panelBoundaryRules', 'word', 'upper')} RULES is what says it is a panel`],
    ['two columns the vertical stack could not express', `${countValue(registry, 'unyieldingTableColumns', 'word')} columns the vertical stack could not express`],
    ['three rules want the same moment', `${countValue(registry, 'coincidentRenderRules', 'word')} rules want the same moment`],
    ['a twelve-row gutter has TWENTY-FOUR positions', `a ${countValue(registry, 'scrollbarRows', 'word')}-row gutter has ${countValue(registry, 'scrollbarHalfRowPositions', 'word', 'upper')} positions`],
    ['two vocabularies, and the split is the whole design', `${countValue(registry, 'agentRampVocabularies', 'word')} vocabularies, and the split is the whole design`],
    ['two states, slow', `${countValue(registry, 'toggleStates', 'word')} states, slow`],
    ['four corners', `${countValue(registry, 'triangleCorners', 'word')} corners`],
    ['what changes, and it is only three things', `what changes, and it is only ${countValue(registry, 'questionChangeFacts', 'word')} things`],
    ['a resize is not a redraw — three things have to survive it', `a resize is not a redraw — ${countValue(registry, 'resizeSurvivors', 'word')} things have to survive it`],
    ['none of the three is a position on screen. All three are', `none of the ${countValue(registry, 'resizeSurvivors', 'word')} is a position on screen. All ${countValue(registry, 'resizeSurvivors', 'word')} are`],
    ['three things refused, and each is refused for the same reason', `${countValue(registry, 'refusalCases', 'word')} things refused, and each is refused for the same reason`],
    ['two hues', `${countValue(registry, 'gradientHues', 'word')} hues`],
    ['five postures, five symbols', `${countValue(registry, 'permissionPostures', 'word')} postures, ${countValue(registry, 'permissionPostures', 'word')} symbols`],
    ['six rules for a table, and five of them are about NUMBERS', `${countValue(registry, 'tableRules', 'word')} rules for a table, and ${countValue(registry, 'tableNumericRules', 'word')} of them are about NUMBERS`],
    ['two points, the gap is the answer', `${countValue(registry, 'dumbbellPoints', 'word')} points, the gap is the answer`],
    ['past ten they cycle', `past ${countValue(registry, 'identityHues', 'word')} they cycle`],
    ['five trails', `${countValue(registry, 'streamTrails', 'word')} trails`],
    ['four named subsets', `${countValue(registry, 'agentNamedSubsets', 'word')} named subsets`],
    ['ten verbs, ten ramps', `${countValue(registry, 'verbRampPairs', 'word')} verbs, ${countValue(registry, 'verbRampPairs', 'word')} ramps`],
    ['FOUR AMBIGUOUS, EIGHT NARROW', `${countValue(registry, 'canonicalAmbiguousGlyphs', 'word', 'upper')} AMBIGUOUS, ${countValue(registry, 'canonicalNarrowGlyphs', 'word', 'upper')} NARROW`],
    ['8 of 21 sets passed', `${countValue(registry, 'legacyCycleBandPasses')} of ${countValue(registry, 'spinnerSets')} sets passed`],
    ['the same exchange at three rungs', `the same exchange at ${countValue(registry, 'degradationRungs', 'word')} rungs`],
    ['Ten themes', `${countValue(registry, 'themes', 'word', 'cap')} themes`],
    ['ten themes', `${countValue(registry, 'themes', 'word')} themes`],
    ['21 spinner sets', `${countValue(registry, 'spinnerSets')} spinner sets`],
    ['nine bar styles', `${countValue(registry, 'barStyles', 'word')} bar styles`],
    ['twelve canonical glyphs', `${countValue(registry, 'glyphs', 'word')} canonical glyphs`],
    ['TWELVE CANONICAL GLYPHS', `${countValue(registry, 'glyphs', 'word', 'upper')} CANONICAL GLYPHS`],
    ['four principles', `${countValue(registry, 'interactionPrinciples', 'word')} principles`],
    ['Four principles', `${countValue(registry, 'interactionPrinciples', 'word', 'cap')} principles`],
    ['FOUR principles', `${countValue(registry, 'interactionPrinciples', 'word', 'upper')} principles`],
    ['THREE scopes', `${countValue(registry, 'scopes', 'word', 'upper')} scopes`],
    ['three scopes', `${countValue(registry, 'scopes', 'word')} scopes`],
    ['five regions', `${countValue(registry, 'agentRegions', 'word')} regions`],
    ['Five regions', `${countValue(registry, 'agentRegions', 'word', 'cap')} regions`],
    ['FOUR outcomes', `${countValue(registry, 'controlCOutcomes', 'word', 'upper')} outcomes`],
    ['four outcomes', `${countValue(registry, 'controlCOutcomes', 'word')} outcomes`],
    ['five contexts', `${countValue(registry, 'controlCContexts', 'word')} contexts`],
    ['five permission postures', `${countValue(registry, 'permissionPostures', 'word')} permission postures`],
    ['Five permission postures', `${countValue(registry, 'permissionPostures', 'word', 'cap')} permission postures`],
    ['ten hues', `${countValue(registry, 'identityHues', 'word')} hues`],
    ['ten chrome hues', `${countValue(registry, 'identityHues', 'word')} chrome hues`],
    ['six slots', `${countValue(registry, 'syntaxSlots', 'word')} slots`],
    ['seven core facts', `${countValue(registry, 'componentFacts', 'word')} core facts`],
    ['seven required facts', `${countValue(registry, 'componentFacts', 'word')} required facts`],
    ['six pointer rulings', `${countValue(registry, 'pointerRulings', 'word')} pointer rulings`],
    ['Six pointer rulings', `${countValue(registry, 'pointerRulings', 'word', 'cap')} pointer rulings`],
    ['six rulings', `${countValue(registry, 'pointerRulings', 'word')} rulings`],
    ['three refusals', `${countValue(registry, 'refusalCases', 'word')} refusals`],
    ['Three refusals', `${countValue(registry, 'refusalCases', 'word', 'cap')} refusals`],
    ['eight cases', `${countValue(registry, 'edgeCases', 'word')} cases`],
    ['Eight cases', `${countValue(registry, 'edgeCases', 'word', 'cap')} cases`],
    ['three tiers', `${countValue(registry, 'adaptationTiers', 'word')} tiers`],
    ['Three tiers', `${countValue(registry, 'adaptationTiers', 'word', 'cap')} tiers`],
    ['THREE TIERS', `${countValue(registry, 'adaptationTiers', 'word', 'upper')} TIERS`],
    ['five primitives', `${countValue(registry, 'addedPrimitives', 'word')} primitives`],
    ['Five primitives', `${countValue(registry, 'addedPrimitives', 'word', 'cap')} primitives`],
    ['FIVE PRIMITIVES', `${countValue(registry, 'addedPrimitives', 'word', 'upper')} PRIMITIVES`],
    ['six composition cases', `${countValue(registry, 'compositionCases', 'word')} composition cases`],
    ['Six composition cases', `${countValue(registry, 'compositionCases', 'word', 'cap')} composition cases`],
    ['SIX COMPOSITION CASES', `${countValue(registry, 'compositionCases', 'word', 'upper')} COMPOSITION CASES`],
    ['three records', `${countValue(registry, 'historyRecords', 'word')} records`],
    ['Three records', `${countValue(registry, 'historyRecords', 'word', 'cap')} records`],
    ['THREE THINGS', `${countValue(registry, 'historyRecords', 'word', 'upper')} THINGS`],
    ['four major things', `${countValue(registry, 'majorRepairs', 'word')} major things`],
    ['Four major things', `${countValue(registry, 'majorRepairs', 'word', 'cap')} major things`],
    ['four spinner rules', `${countValue(registry, 'spinnerRules', 'word')} spinner rules`],
    ['four rules the sets obey', `${countValue(registry, 'spinnerRules', 'word')} rules the sets obey`],
    ['four plot forms', `${countValue(registry, 'runPlotForms', 'word')} plot forms`],
    ['A run needs FOUR;', `A run needs ${countValue(registry, 'runPlotForms', 'word', 'upper')};`],
    ['five including sweeps', `${countValue(registry, 'plotFormsIncludingSweeps', 'word')} including sweeps`],
    ['four states, one shape', `${countValue(registry, 'callStates', 'word')} states, one shape`],
    ['three surfaces, and the chip', `${countValue(registry, 'subagentSurfaces', 'word')} surfaces, and the chip`],
    ['four things wait on', `${countValue(registry, 'spanConsumers', 'word')} things wait on`],
    ['two kinds, one clipboard', `${countValue(registry, 'selectionKinds', 'word')} kinds, one clipboard`],
    ['two selections, one clipboard', `${countValue(registry, 'selectionKinds', 'word')} selections, one clipboard`],
    ['one exchange, three rungs', `one exchange, ${countValue(registry, 'degradationRungs', 'word')} rungs`],
    ['Three major rules', `${countValue(registry, 'brokenRules', 'word', 'cap')} major rules`],
    ['three major rules', `${countValue(registry, 'brokenRules', 'word')} major rules`],
    ['A status has three parts', `A status has ${countValue(registry, 'statusParts', 'word')} parts`],
    ['A STATUS HAS THREE PARTS', `A STATUS HAS ${countValue(registry, 'statusParts', 'word', 'upper')} PARTS`],
    ['five jobs', `${countValue(registry, 'arrowJobs', 'word')} jobs`],
    ['FIVE JOBS', `${countValue(registry, 'arrowJobs', 'word', 'upper')} JOBS`],
    ['six more', `${countValue(registry, 'stateComponentsB', 'word')} more`]
  ];
  let output = value;
  for (const [literal, replacement] of replacements) output = output.split(literal).join(replacement);
  if (output.includes('{{APPROVAL_INSPECTION_LABEL}}')) {
    const inspection = active(registry.approvalChoices).find(choice => choice.kind === 'inspection');
    if (!inspection) throw new Error('approval inspection choice is missing');
    output = output.replaceAll('{{APPROVAL_INSPECTION_LABEL}}', esc(inspection.label));
  }
  return output;
}

function renderContract(registry) {
  const current = registry.rules.filter(rule => rule.status === 'current');
  const history = registry.rules.filter(rule => rule.status === 'superseded');
  const lines = current.map(rule => {
    const legacy = rule.legacyIds?.length ? `<span class="c-dim"> legacy ${esc(rule.legacyIds.join(', '))} · </span>` : '';
    const section = rule.sectionKey ? ` <a class="rule-ref" href="#${esc(rule.sectionKey)}">section</a>` : '';
    return `<span id="${rule.id}" class="c-default">${rule.id}  </span>${legacy}<span class="c-muted">${generatedClaims(registry, esc(rule.text))}</span>${section}`;
  }).join('\n');
  const oldLines = history.map(rule => `<span id="${rule.id}" class="c-dim">${rule.id}  SUPERSEDED → </span><a class="rule-ref" href="#${rule.supersededBy}">${rule.supersededBy}</a><span class="c-muted">  ${generatedClaims(registry, esc(rule.text))}</span>`).join('\n');
  return `<pre class=term><span class="c-default bold">CURRENT CONTRACT · revision ${esc(registry.meta.revision)}</span>
<span class="c-muted">Generated from the registry. IDs are permanent; only CURRENT records are normative.</span>
<span class="c-muted">Every repetition below is rendered from or cites one of these records. EXAMPLE sections cannot create a requirement.</span>
<span class=gap> </span>
${lines}</pre>
<details class="registry-history" data-numeric-context="superseded-history"><summary>${countValue(registry, 'supersededRules')} retained superseded rules — inspect replacement links</summary><pre class=term>${oldLines}</pre></details>`;
}

function renderPrimitives(registry) {
  const sections = new Map(registry.sections.map(section => [section.key, section]));
  const rows = active(registry.primitives).map(item => {
    const locations = item.definedIn.map(key => {
      const section = sections.get(key);
      return `<a class="rule-ref" href="#${esc(key)}">§${section.order} ${generatedClaims(registry, esc(section.title))}</a>`;
    }).join(' · ');
    return `<span class="c-default" data-primitive="${esc(item.id)}">  ${item.name.padEnd(14)}</span><span class="c-muted">${generatedClaims(registry, esc(item.definition))}</span><span class="c-dim">  [${refs(item.ruleIds)}]</span>\n<span class="c-default">  ${''.padEnd(14)}</span><span class="c-dim" data-primitive-defined-in="${esc(item.id)}">defined in ${locations}</span>`;
  }).join('\n');
  return `<pre class=term><span class="c-default bold">THE PRIMITIVE INDEX · generated from ${countValue(registry, 'primitives')} current records [${refs(['R-PRI-001'])}]</span>
<span class="c-muted">A primitive has one general name, one definition, canonical section links, and current rule citations. [${refs(['R-PRI-002'])}]</span>
<span class=gap> </span>
${rows}</pre>`;
}

function renderGlyphReservationProbe(registry) {
  const rows = [...active(registry.glyphs), ...active(registry.delimiters)].flatMap(glyph => ['unicode', 'ascii'].map(form => {
    const value = glyph[form];
    return `<span class="glyph-grid-probe-row" style="display:block" data-glyph-grid-probe="${esc(glyph.id)}" data-glyph-form="${form}" data-reserved-cells="${glyph.reservedCells}"><span class="glyph-grid-slot" style="display:inline-block;inline-size:${glyph.reservedCells}ch;white-space:pre"><span class="glyph-grid-value">${esc(value)}</span></span><span class="glyph-grid-sentinel">|</span></span>`;
  })).join('');
  return `<div id="glyph-grid-probes" aria-hidden="true" data-rule-ids="R-GLY-002" style="position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;font:12.5px/1.45 &quot;SF Mono&quot;,Menlo,Consolas,&quot;DejaVu Sans Mono&quot;,monospace"><span id="glyph-grid-cell" style="display:inline-block;inline-size:1ch">0</span>${rows}</div>`;
}

function renderGlyphs(registry) {
  const pad = (value, width) => String(value).padEnd(width);
  const row = glyph => {
    const widths = `${glyph.widthByCapability.unicode}/${glyph.widthByCapability.ascii}`;
    const tone = glyph.tone === 'attention' ? 'warn' : glyph.tone;
    return `<span class="c-default">  </span><span class="c-${esc(tone)}">${esc(glyph.unicode)}</span><span class="c-default">  ${pad(glyph.ascii, 5)} ${pad(glyph.semanticRole, 27)} ${pad(widths, 5)} ${glyph.reservedCells}</span>`;
  };
  const canonicalRows = active(registry.glyphs).filter(glyph => glyph.canonical).map(row).join('\n');
  const auxiliaryRows = active(registry.glyphs).filter(glyph => !glyph.canonical).map(row).join('\n');
  const delimiters = active(registry.delimiters).map(item => `${item.unicode} → ${item.ascii}`).join('    ');
  return `<pre class=term><span class="c-muted">${countValue(registry, 'glyphs', 'word', 'upper')} CANONICAL GLYPHS · generated from one registry [${refs(['R-GLY-001'])}]</span>
<span class="c-muted">ASCII fallbacks are collision-checked as a co-rendered set. reservedCells is the widest rung.</span>
<span class=gap> </span>
<span class="c-default bg-bgElev"> glyph  ascii role                        u/a   reservedCells</span>
${canonicalRows}
<span class=gap> </span>
<span class="c-muted">supporting registered marks — inventory-checked, not part of the canonical twelve</span>
${auxiliaryRows}
<span class=gap> </span>
<span class="c-muted">tape delimiters   ${esc(delimiters)}</span>
<span class="c-muted">The renderer pads a narrow representation inside its reservation; following columns do not move. Browser measurement verifies both forms in the composed grid. [${refs(['R-GLY-002'])}]</span></pre>${renderGlyphReservationProbe(registry)}`;
}

function renderKeymap(registry, compact = false) {
  const bindings = active(registry.bindings);
  const groups = new Map();
  for (const binding of bindings) {
    if (!groups.has(binding.scope)) groups.set(binding.scope, []);
    groups.get(binding.scope).push(binding);
  }
  const groupEntries = [...groups.entries()];
  if (compact && registry.keymapPolicy.help.currentScopeFirst.required) {
    const currentScope = registry.keymapPolicy.help.currentScopeFirst.exampleScope;
    groupEntries.sort(([left], [right]) => left === currentScope ? -1 : right === currentScope ? 1 : 0);
  }
  const rows = groupEntries.map(([scope, entries]) => {
    const header = `<span class="c-default bold bg-bgElev"> ${esc(scope)} </span>`;
    // ROUTE TYPE and CONDITION are part of the contract. Dropping them put the
    // non-typing `?` and the typing `/help` command side by side as if both were
    // unconditional global keys.
    const body = entries.map(item => {
      const route = item.kind === 'command' ? '<span class="c-meta">cmd </span>' : '<span class="c-muted">key </span>';
      const when = item.when ? `<span class="c-meta"> \u00b7 ${esc(item.when)}</span>` : '';
      return `<span class="c-default">  </span>${route}<span class="c-accent">${esc(item.chord.padEnd(7))}</span><span class="c-muted">${esc(item.label)}</span>${when}`;
    }).join('\n');
    return `${header}\n${body}`;
  }).join('\n<span class=gap> </span>\n');
  const heading = compact
    ? `<span class="c-ok">● </span><span class="c-default">keys</span><span class="c-muted"> · </span><span class="c-ok">${countValue(registry, 'bindings')} bindings</span>`
    : `<span class="c-default bold">RESOLVED DEFAULT-TERMINAL KEYMAP · ${countValue(registry, 'bindings')} bindings</span>`;
  const intro = compact
    ? `<span class="c-muted" data-help-policy="durable-entry">${esc(registry.keymapPolicy.help.durableEntry)}</span>`
    : `<span class="c-muted" data-keymap-policy="universal">${esc(registry.keymapPolicy.universal)}</span>\n<span class="c-muted">Actions are primary. Chords are the resolved profile. A named command route is the intended contract; only ${active(registry.bindings).filter(b => b.kind === 'command').length} of ${active(registry.bindings).length} bindings carry one today.</span>`;
  const policy = compact
    ? `<span class="c-muted" data-help-policy="current-scope-first">${esc(registry.keymapPolicy.help.currentScopeFirst.description)}</span>
<span class="c-muted" data-help-policy="grouping">${esc(registry.keymapPolicy.help.grouping)}</span>
<span class="c-muted" data-help-policy="coverage">${esc(registry.keymapPolicy.help.generatedCoverage)}</span>
<span class="c-muted" data-help-policy="docs">${esc(registry.keymapPolicy.help.docsContract)}</span>
<span class="c-dim">[${refs(registry.keymapPolicy.help.ruleIds)}]</span>`
    : `<span class="c-default bold" data-keymap-rationale="deliberate">WHAT CHANGED DELIBERATELY, AND WHY</span>
${registry.keymapPolicy.deliberateChanges.map(item => `<span class="c-default">  </span><span class="c-muted">${esc(item.from.padEnd(22))}</span><span class="c-ok">→ ${esc(item.to.padEnd(8))}</span><span class="c-default">${esc(item.reason)}</span>`).join('\n')}
<span class=gap> </span>
<span class="c-default bold" data-keymap-rationale="platform">PLATFORM CONVENTIONS THAT STAY OWNED</span>
${registry.keymapPolicy.platformConventions.map(line => `<span class="c-default">  </span><span class="c-muted">${esc(line)}</span>`).join('\n')}
<span class=gap> </span>
<span class="c-default bold" data-keymap-rationale="owned">CHORDS THAT ARE GENUINELY OURS</span>
${registry.keymapPolicy.ownedChordRationale.map(line => `<span class="c-default">  </span><span class="c-muted">${esc(line)}</span>`).join('\n')}
<span class="c-dim">[${refs(registry.keymapPolicy.ruleIds)}]</span>`;
  return `<pre class=term>${heading}\n${intro}\n<span class=gap> </span>\n${rows}\n<span class=gap> </span>\n${policy}\n<span class=gap> </span>\n<span class="c-muted">Keymap and ? help are generated from R-KEY-007; retained footer specimens remain examples.</span></pre>`;
}

const markdownCell = value => String(value).replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

export function renderKeysMarkdown(registry) {
  const bindings = active(registry.bindings);
  const groups = new Map();
  for (const binding of bindings) {
    if (!groups.has(binding.scope)) groups.set(binding.scope, []);
    groups.get(binding.scope).push(binding);
  }
  // Route and Condition are columns, not omissions. `/help` under a "Key" column
  // with no condition read as an unconditional global keystroke.
  const sections = [...groups.entries()].map(([scope, entries]) => `## ${scope}\n\n| Route | Binding | Condition | Action | Meaning |\n| --- | --- | --- | --- | --- |\n${entries.map(binding => `| ${markdownCell(binding.kind ?? 'key')} | ${markdownCell(binding.chord)} | ${markdownCell(binding.when ?? 'always')} | ${markdownCell(binding.actionId)} | ${markdownCell(binding.label)} |`).join('\n')}`).join('\n\n');
  return `<!-- GENERATED FILE — DO NOT EDIT. Source: ../calcium-registry.json; builder: ../build-calcium.mjs -->\n# Calcium keys\n\nRevision ${registry.meta.revision} · ${bindings.length} current bindings · profile: default-terminal\n\n${registry.keymapPolicy.universal}\n\n${registry.keymapPolicy.help.docsContract}\n\n${sections}\n`;
}

function renderSpinners(registry) {
  const reusable = active(registry.spinners).filter(item => item.reusable);
  const row = item => {
    const asciiFrames = spinnerAsciiFrames(registry, item);
    return `<span data-spinner-inventory="${esc(item.id)}" data-ascii-resolved="${esc(asciiFrames.join(''))}"><span class="c-default">  </span><span class="c-accent sp sp-${esc(item.id)}"></span><span class="c-default">  ${esc(item.id.padEnd(16))}</span><span class="c-muted">${String(item.intervalMs).padStart(4)}ms   </span><span class="c-dim">${esc(item.frames.join(''))}</span></span>`;
  };
  const rows = reusable.map(row).join('\n');
  return `<pre class=term><span class="c-muted">Every reusable set carries its own interval; the caller never picks one.</span>
<span class="c-muted">${countValue(registry, 'reusableSpinners')} named reusable sets are shown here; the composite agent walk makes ${countValue(registry, 'spinnerSets')}.</span>
<span class=gap> </span>
${rows}
<span class=gap> </span>
<span class="c-muted" data-spinner-policy="preview">${esc(registry.spinnerPolicy.terminalResolution)}</span>
<span class="c-muted">The generated fallback table separately demonstrates the ASCII degradation rung; <code>?glyphs=auto</code> is an optional per-set browser diagnostic.</span></pre>`;
}

function spinnerPatternDescriptor(registry, spinner) {
  if (spinner.asciiTrajectory.type === 'fit-cycle') {
    return { attribute: spinner.asciiPattern.join(''), visible: spinner.asciiPattern.join(' ') };
  }
  const ids = spinner.asciiTrajectory.spinnerIds;
  const visible = ids.map(id => {
    const source = active(registry.spinners).find(item => item.id === id);
    return `${id}(${source.asciiPattern.join(' ')})`;
  }).join(' + ');
  return { attribute: ids.join('+'), visible };
}

function renderSpinnerFallbackTable(registry) {
  const rows = active(registry.spinners).map(item => {
    const asciiFrames = spinnerAsciiFrames(registry, item);
    const descriptor = spinnerPatternDescriptor(registry, item);
    return `<span data-spinner-fallback="${esc(item.id)}" data-ascii-motion="${esc(item.asciiMotion)}" data-ascii-trajectory="${esc(item.asciiTrajectory.type)}" data-ascii-pattern="${esc(descriptor.attribute)}" data-ascii-resolved="${esc(asciiFrames.join(''))}" data-glyph-capability="ascii"><span class="c-accent sp sp-${esc(item.id)}"></span><span class="c-default">  ${esc(item.id.padEnd(16))}</span><span class="c-muted">${esc(item.asciiMotion.padEnd(17))}</span><span class="c-default">${esc(descriptor.visible.padEnd(34))}</span><span class="c-muted">${String(item.intervalMs).padStart(4)}ms · ${String(item.frames.length).padStart(2)} frames</span></span>`;
  }).join('\n');
  return `<span class="c-default bold" data-generated-spinner-fallbacks="current">SEMANTIC ASCII FALLBACKS · GENERATED FROM THE SPINNER REGISTRY [${refs(['R-MOT-005'])}]</span>
<span class="c-muted">  sample  primary           motion           fitted trajectory                   interval · resolved length</span>
${rows}
<span class="c-muted">Each base pattern is fitted once across the primary trajectory; composite sets concatenate named source trajectories. The same resolved frames generate the ASCII CSS.</span>`;
}

const cssString = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const percent = (index, total) => `${Number(((index * 100) / total).toFixed(6))}%`;
function spinnerCss(registry) {
  const blocks = active(registry.spinners).map(spinner => {
    const frames = spinner.frames.map((frame, index) => `${percent(index, spinner.frames.length)}{content:${cssString(frame)}}`).join('');
    const asciiFrames = spinnerAsciiFrames(registry, spinner);
    const asciiKeyframe = `${spinner.keyframe}-ascii`;
    const ascii = asciiFrames.map((frame, index) => `${percent(index, asciiFrames.length)}{content:${cssString(frame)}}`).join('');
    const phase = spinner.id === 'agent' ? ' var(--phase,0ms)' : '';
    return `@keyframes ${spinner.keyframe}{${frames}}\n@keyframes ${asciiKeyframe}{${ascii}}\n.sp-${spinner.id}::after{content:${cssString(spinner.initial)};animation:${spinner.keyframe} ${spinner.cycleMs}ms steps(1,end)${phase} infinite}\n[data-glyph-capability="ascii"] .sp-${spinner.id}::after,.sp-${spinner.id}[data-spinner-capability="ascii"]::after,[data-spinner-capability="ascii"] .sp-${spinner.id}::after{content:${cssString(asciiFrames[0])};animation-name:${asciiKeyframe}}`;
  });
  return `/* GENERATED SPINNER CSS · current R-MOT-002 and R-MOT-005 records only */\n${blocks.join('\n')}`;
}

function renderBars(registry) {
  const bars = active(registry.bars);
  const sample = registry.barPolicy.gallerySample;
  const rows = bars.map(item => `<span class="c-default" data-bar-alphabet="${esc(item.id)}">  </span><span class="c-accent">${esc(item.filled.repeat(sample.filledCells))}</span><span class="c-muted">${esc(item.empty.repeat(sample.emptyCells))}</span><span class="c-default">   ${esc(item.id.padEnd(12))}</span><span class="c-muted">${esc(sample.label)}</span>`).join('\n');
  const byId = new Map(bars.map(item => [item.id, item]));
  const placementRows = registry.barSpecimens.map(specimen => {
    if (specimen.kind === 'spinner') {
      return `<span data-bar-specimen="${esc(specimen.id)}" data-content-digest="${esc(specimen.contentDigest)}"><span class="c-default">  </span><span class="c-${esc(specimen.tone)} sp sp-${esc(specimen.spinnerId)}" data-bar-placement="indeterminate"></span><span class="c-muted"> ${esc(specimen.elapsed)}</span><span class="c-default">${' '.repeat(specimen.padCells)}</span><span class="c-muted">${esc(specimen.label)}</span></span>`;
    }
    const item = byId.get(specimen.barId);
    const cells = item.filled.repeat(specimen.filledCells) + item.empty.repeat(specimen.emptyCells);
    return `<span data-bar-specimen="${esc(specimen.id)}" data-content-digest="${esc(specimen.contentDigest)}"><span class="c-default">  </span><span class="c-${esc(specimen.tone)}" data-bar-placement="${esc(specimen.barId)}">${esc(cells)}</span><span class="c-default">${' '.repeat(specimen.padCells)}</span><span class="c-muted">${esc(specimen.label)}</span></span>`;
  }).join('\n');
  return `<pre class=term><span class="c-muted">The same ${esc(sample.label)} in ${countValue(registry, 'barStyles', 'word')} registered alphabets [${refs(['R-PRG-001'])}]</span>
<span class="c-muted">filled = floor(clamp(value ÷ total, 0, 1) × width + 0.5); empty = width − filled.</span>
<span class=gap> </span>
${rows}
<span class=gap> </span>
<span class="c-default bold">AND WHERE EACH BELONGS [${refs(['R-PRG-002'])}]</span>
${placementRows}
<span class=gap> </span>
<span class="c-muted">The remaining registered alphabets are alternate textures, not additional progress semantics.</span>
<span class="c-muted">Alphabet follows granularity; quantity and liveness remain independent.</span></pre>`;
}

function rampSample(item) {
  const text = item.galleryGroup === 'bar' ? '▰'.repeat(16) : item.specimenText;
  const chars = [...text].map((char, index) => `<span style="--i:${index}">${esc(char)}</span>`).join('');
  const empty = item.galleryGroup === 'bar' ? '<span class="c-muted">▱▱▱▱▱▱▱▱</span>' : '';
  return `<span class="c-${esc(item.tone)} rmp ${esc(item.cssClass)}" data-ramp-specimen-text="${esc(item.specimenText)}">${chars}</span>${empty}`;
}
function renderRamps(registry) {
  const ordered = active(registry.ramps).sort((left, right) => left.galleryOrder - right.galleryOrder);
  const groupLabels = { gradient: 'GRADIENTS · COLOUR VARYING OVER AN EXTENT, NO MOTION', animated: 'ANIMATED INK · EACH EFFECT KEEPS ITS ORIGINAL TONE AND CADENCE', bar: 'BAR CARRIER · THE BAND RUNS THROUGH THE FILLED CELLS' };
  const grouped = new Map();
  for (const item of ordered) {
    if (!grouped.has(item.galleryGroup)) grouped.set(item.galleryGroup, []);
    grouped.get(item.galleryGroup).push(item);
  }
  const rows = [...grouped.entries()].map(([group, items]) => {
    const rendered = items.map(item => {
      const sampleWidth = item.galleryGroup === 'bar' ? 24 : [...item.specimenText].length;
      const pad = ' '.repeat(Math.max(2, 40 - sampleWidth));
      return `<span class="c-default" data-ramp="${esc(item.id)}" data-ramp-direction="${esc(item.direction)}" data-ramp-attention="${esc(item.attentionGroup)}" data-ramp-meaning="${esc(item.meaning)}">  </span>${rampSample(item)}<span class="c-default">${pad}</span><span class="c-muted">${esc(item.id.padEnd(20))}${esc(item.semantic)}</span>`;
    }).join('\n');
    return `<span class="c-muted bold" data-ramp-gallery-group="${esc(group)}">${esc(groupLabels[group])}</span>\n<span class=gap> </span>\n${rendered}`;
  }).join('\n<span class=gap> </span>\n');
  const groups = Object.entries(registry.rampPolicy.attentionGroups).map(([group, ids]) => `<span class="c-default">  </span><span class="c-muted" data-ramp-group="${esc(group)}">${esc(ids.join(' · ').padEnd(30))}</span><span class="c-default">${esc(group)}</span>`).join('\n');
  return `<pre class=term><span class="c-default bold">INK RAMPS · ${countValue(registry, 'ramps')} registered effects</span>
<span class="c-muted">A shimmer is a TONE effect: characters brighten in sequence; the stagger makes the highlight travel.</span>
<span class="c-muted">Every animated row changes only colour, opacity, or brightness inside the existing cell.</span>
<span class="c-muted">The only other legal animation is a same-cell glyph swap, used by spinner alphabets.</span>
<span class=gap> </span>
${rows}
<span class=gap> </span>
<span class="c-muted" data-ramp-policy="direction">${esc(registry.rampPolicy.direction)}</span>
<span class="c-muted" data-ramp-policy="meaning">${esc(registry.rampPolicy.meaning)}</span>
<span class="c-default bold">SORTED BY HOW MUCH ATTENTION THEY ASK</span>
${groups}
<span class="c-muted" data-ramp-policy="low-colour">${esc(registry.rampPolicy.lowColour)}</span>
<span class="c-dim">[${refs(registry.rampPolicy.ruleIds)}]</span>
<span class=gap> </span>
<span class="c-muted">Per-character delays are preserved. Geometry and layout are rejected by the carrier compiler.</span></pre>`;
}

function renderStateTables(registry, renderer) {
  const group = registry.stateTableGroups.find(item => item.renderer === renderer);
  if (!group) throw new Error(`missing state table group ${renderer}`);
  const components = active(group.components);
  const stateText = value => generatedClaims(registry, esc(value));
  const renderRows = (label, lines, attribute, value) => lines.map((line, index) => {
    const visibleLabel = index === 0 ? label : '';
    const marker = index === 0 ? ` ${attribute}="${esc(value)}"` : '';
    return `<span class="c-default">  </span><span class="c-muted"${marker}>${esc(visibleLabel.padEnd(13))}</span><span class="c-default">${stateText(line)}</span>`;
  }).join('\n');
  const renderNote = note => note.lines.map((line, index) => {
    const marker = index === 0 ? ` data-state-note="${esc(note.kind)}"` : '';
    if (note.kind === 'callout') return `<span class="c-muted bold"${marker}>${stateText(line)}</span>`;
    return `<span class="c-default">  </span><span class="c-muted"${marker}>${stateText(line)}</span>`;
  }).join('\n');
  const intro = [
    ...group.intro.summaryLines.map(line => `<span class="c-default bold" data-state-intro>${stateText(line)}</span>`),
    '<span class=gap> </span>',
    ...STATE_FACT_KEYS.flatMap(key => group.intro.factDefinitions[key]
      ? [renderRows(STATE_FACT_LABELS[key].toUpperCase(), group.intro.factDefinitions[key], 'data-state-definition', key)]
      : []),
    ...(Object.keys(group.intro.factDefinitions).length ? ['<span class=gap> </span>'] : []),
    ...group.intro.notes.map(renderNote),
    ...(group.intro.notes.length ? ['<span class=gap> </span>'] : [])
  ].join('\n');
  const renderedComponents = components.map(component => {
    const rows = [];
    for (const key of STATE_FACT_KEYS) {
      rows.push(renderRows(STATE_FACT_LABELS[key], component.facts[key], 'data-state-fact', key));
      for (const extension of component.extensionRows.filter(item => item.after === key)) {
        rows.push(renderRows(extension.label, extension.lines, 'data-state-extension', extension.key));
      }
    }
    return `<span class="c-default bold bg-bgElev" data-state-component="${esc(component.id)}"> ${esc(component.title.padEnd(76))}</span>\n${rows.join('\n')}\n<span class=gap> </span>`;
  }).join('\n');
  const notes = group.notes.map(renderNote).join('\n<span class=gap> </span>\n');
  return `<pre class=term>${intro}${renderedComponents ? `\n${renderedComponents}` : ''}${notes ? `\n${notes}` : ''}</pre>`;
}

function renderCondensed(registry) {
  const groups = ['STRUCTURE', 'COLOUR', 'MOTION', 'INTERACTION', 'HONESTY', 'DEGRADATION'];
  const blocks = groups.map(group => {
    const items = registry.rules.filter(rule => rule.status === 'current' && rule.condensedGroup === group);
    const lines = items.map(rule => `<span class="c-default">  </span><span class="c-muted">${generatedClaims(registry, esc(rule.text))}</span><span class="c-dim">  [<a class="rule-ref" href="#${rule.id}">${rule.id}</a>]</span>`).join('\n');
    return `<span class="c-default bold">${group}</span>\n${lines}`;
  }).join('\n<span class=gap> </span>\n');
  return `<pre class=term><span class="c-muted">Generated from CURRENT registry records only. This is a projection, never a paraphrased second source.</span>
<span class=gap> </span>
${blocks}</pre>`;
}

function approvalChoices(registry) {
  const choices = active(registry.approvalChoices);
  const parts = choices.map((choice, index) => {
    const klass = index === 1 ? 'c-pickInk bold bg-pick' : 'c-default bg-bgElev';
    return `<span class="${klass}"> ${esc(choice.label)} </span>`;
  });
  return `<span class="c-default"> </span>${parts.join('<span class="c-default">  </span>')}<span class="c-default">                             </span>`;
}

function patchGenericContent(registry, section, source) {
  let content = generatedClaims(registry, source);
  if (content.includes('{{APPROVAL_INSPECTION_LABEL}}')) {
    const inspection = active(registry.approvalChoices).find(choice => choice.kind === 'inspection');
    if (!inspection) throw new Error('approval inspection choice is missing');
    content = content.replaceAll('{{APPROVAL_INSPECTION_LABEL}}', esc(inspection.label));
  }
  if (section.title === 'Approval replaces the prompt') {
    content = content.split('\n').map(line => line.includes(' approve ') && line.includes('always allow edits here') ? approvalChoices(registry) : line).join('\n');
    content = content.replace(/<span class="c-muted">←→ choose\s+⏎ answer<\/span>/, '<span class="c-muted">←→ choose   ⏎ answer</span>');
  }
  // Historical audit specimens show the current generated ASCII rung rather
  // than preserving a collision as if it were still valid.
  content = content
    .replaceAll('● → *', '● → o')
    .replaceAll('❯ → &gt;', '❯ → $')
    .replaceAll('❯ → >', '❯ → $')
    .replaceAll('› → &gt;', '› → *')
    .replaceAll('› → >', '› → *')
    .replaceAll('⟩ → )', '⟩ → ?');
  if (section.title === 'Three major rules it broke in its own examples') {
    content = content.replace('* `- ) ! &gt; &gt; v o y n &gt; ...', 'o `- ? ^ $ &gt; v @ + x * ...');
  }
  if (section.title === 'The four spinner rules') {
    const startMarker = '<span class="c-default">  </span><span class="c-muted">ambiguous-width primary  semantic fallback  interval</span>';
    const endMarker = '<span class="c-default">  </span><span class="c-muted">other primary sets use their measured one-cell frames unchanged.</span>';
    const start = content.indexOf(startMarker), end = content.indexOf(endMarker, start);
    if (start < 0 || end < 0) throw new Error('spinner fallback prose table markers missing');
    content = `${content.slice(0, start)}${renderSpinnerFallbackTable(registry)}${content.slice(end + endMarker.length)}`;
  }
  if (section.ruleSetKey) {
    const items = atPath(registry, section.ruleSetKey);
    const catalogueName = section.ruleSetKey.split('.').at(-1);
    for (const item of items) {
      const token = `{{RULE_ITEM:${catalogueName}:${item.id}}}`;
      const marker = `>${token}</span>`;
      const occurrenceCount = content.split(marker).length - 1;
      if (occurrenceCount !== 1) throw new Error(`${section.key}.${item.id} generated heading token occurs ${occurrenceCount} times`);
      const citation = `<span class="c-dim" data-atomic-rule="${esc(item.id)}"> [${refs(item.ruleIds)}]</span>`;
      content = content.replace(marker, `>${esc(item.heading)}</span>${citation}`);
    }
  }
  return content;
}

function renderStructuredSection(registry, section) {
  const blocksById = new Map(registry.sectionBlocks.map(block => [block.id, block]));
  const fragments = section.blockIds.map(id => {
    const block = blocksById.get(id);
    if (!block) throw new Error(`${section.key} points to missing structured block ${id}`);
    // CURRENT rule IDs are anchored once in the generated contract. Their
    // specimen occurrence gets a unique use-site id; EXAMPLE block IDs are
    // anchored here because they are intentionally absent from that contract.
    const anchorId = block.status === 'current' ? `block-use-${block.id}` : block.id;
    const anchor = `<span id="${esc(anchorId)}" data-section-block="${esc(block.id)}" data-block-status="${esc(block.status)}"></span>`;
    const citation = block.status === 'current'
      ? `<span class="c-dim" data-normative-block="${esc(block.id)}"> [${refs([block.id])}]</span>`
      : '';
    let rendered = block.renderHtml;
    const preStart = rendered.match(/^<pre\b[^>]*>/)?.[0];
    if (preStart) rendered = rendered.replace(preStart, `${preStart}${anchor}`);
    else rendered = `${anchor}${rendered}`;
    if (rendered.endsWith('</pre>')) rendered = `${rendered.slice(0, -6)}${citation}</pre>`;
    else rendered += citation;
    return rendered;
  });
  return patchGenericContent(registry, section, fragments.join(BLOCK_GAP));
}

function sectionTitle(registry, section) {
  if (section.renderer === 'glyphs') return `The mark vocabulary — ${countValue(registry, 'glyphs', 'word')} canonical glyphs`;
  if (section.renderer === 'bars') return `Progress bars — ${countValue(registry, 'barStyles', 'word')} alphabets, and where each belongs`;
  if (section.renderer === 'stateTablesA') return `State tables — ${countValue(registry, 'componentFacts', 'word')} core facts per component`;
  if (section.renderer === 'stateTablesB') return `State tables — ${countValue(registry, 'stateComponentsB', 'word')} more`;
  return generatedClaims(registry, section.titleHtml);
}

function sectionBody(registry, section) {
  switch (section.renderer) {
    case 'contract': return renderContract(registry);
    case 'primitives': return renderPrimitives(registry);
    case 'glyphs': return renderGlyphs(registry);
    case 'keymap': return renderKeymap(registry, false);
    case 'help': return renderKeymap(registry, true);
    case 'spinners': return renderSpinners(registry);
    case 'bars': return renderBars(registry);
    case 'ramps': return renderRamps(registry);
    case 'stateTablesA':
    case 'stateTablesB': return renderStateTables(registry, section.renderer);
    case 'condensed': return renderCondensed(registry);
    default: return renderStructuredSection(registry, section);
  }
}

function renderSection(registry, section) {
  const governing = section.ruleIds.map(id => registry.rules.find(rule => rule.id === id));
  if (!governing.every(rule => rule?.status === 'current')) throw new Error(`${section.key} has a non-current governing citation`);
  const isProjection = Boolean(section.renderer || section.blockIds);
  const status = isProjection ? 'current' : 'example';
  const extraAttrs = section.attrs
    .replace(/\bid="[^"]*"/g, '')
    .replace(/\btabindex="[^"]*"/g, '')
    .trim();
  const badgeLinks = section.ruleIds.filter(id => !isBlockRuleId(id)).map(id => {
    const target = registry.rules.find(rule => rule.id === id)?.status === 'example' ? `#${section.key}` : `#${id}`;
    return `<a href="${target}">${id}</a>`;
  }).join(' ');
  const specimen = registry.rules.find(rule => rule.id === section.recordId);
  if (!specimen || specimen.status !== 'example') throw new Error(`${section.key} lacks example provenance`);
  const blockNote = section.blockIds ? ' · retained example blocks generated from registry' : '';
  const badge = isProjection
    ? `current · ${badgeLinks}${blockNote} · <span id="${esc(specimen.id)}">example ${esc(specimen.id)}</span>`
    : `<span id="${esc(specimen.id)}">example · ${esc(specimen.id)}</span> · governed by current ${badgeLinks}`;
  return `<section id="${esc(section.key)}" data-rule-ids="${esc(section.ruleIds.join(' '))}" data-rule-status="${esc(status)}" data-example-id="${esc(section.recordId)}"${extraAttrs ? ` ${extraAttrs}` : ''}><h2 data-count-scope="registry-prose" data-count-source="${esc(section.recordId)}">${sectionTitle(registry, section)}<span class="rule-badge" data-count-scope="metadata">${badge}</span></h2>${sectionBody(registry, section)}</section>`;
}

function themeCss(registry) {
  return registry.themeRules
    .filter(rule => rule.status === 'current')
    .map(rule => `${rule.selector}{${rule.declarations}}`)
    .join('\n');
}

function themeControls(registry) {
  const buttons = active(registry.themes).map((theme, index) => `<button class="sw${index === 0 ? ' on' : ''}" type=button aria-pressed=${index === 0 ? 'true' : 'false'} data-t="${esc(theme.id)}" style="background:${esc(theme.background)};color:${esc(theme.ink)};border-color:${esc(theme.border)}">${esc(theme.label)}</button>`).join('');
  return `<div class=bar data-count-scope="specimen" role=group aria-label="Preview controls">${buttons}<button id=motion-toggle class="sw motion-toggle" type=button aria-pressed=false>Pause motion</button></div>`;
}

function scopeSectionNumerals(html) {
  return html
    .replaceAll('<div class="bar2">', '<div class="bar2" data-count-scope="specimen">')
    .replace('<div id="glyph-grid-probes"', '<div data-count-scope="specimen" id="glyph-grid-probes"');
}

function spinnerCapabilityScript(registry) {
  const sets = Object.fromEntries(active(registry.spinners).map(spinner => [spinner.id, [...new Set(spinner.frames)]]));
  const policy = registry.spinnerPolicy;
  return `<script id="generated-spinner-capability">
(()=>{const body=document.body,sets=${JSON.stringify(sets)};const clearPerSet=()=>{for(const node of document.querySelectorAll('[data-spinner-capability]'))node.removeAttribute('data-spinner-capability')};const apply=(value,source)=>{clearPerSet();body.dataset.glyphCapability=value;body.dataset.spinnerCapabilitySource=source;delete body.dataset.spinnerCapabilityMix;document.documentElement.dataset.spinnerCapabilityCheck='selected'};
const measure=()=>{const host=document.querySelector('.term');if(!host){apply('${esc(policy.previewDefault)}','measurement-unavailable-rich-preview');return {}}const probe=document.createElement('span');probe.id='spinner-capability-probe';probe.className='term';probe.setAttribute('aria-hidden','true');probe.style.cssText='position:absolute;visibility:hidden;display:inline-block;width:auto;max-width:none;padding:0;margin:0;border:0;white-space:pre;overflow:visible';body.append(probe);const width=text=>{probe.textContent=text;return probe.getBoundingClientRect().width},cell=width('0'),tolerance=Math.max(.25,cell*.08),result={};apply('unicode-narrow','measured-per-set');for(const [id,glyphs] of Object.entries(sets)){const narrow=Number.isFinite(cell)&&cell>0&&glyphs.every(glyph=>Math.abs(width(glyph)-cell)<=tolerance);result[id]=narrow?'unicode-narrow':'ascii';for(const node of document.querySelectorAll('.sp-'+id))node.dataset.spinnerCapability=result[id]}probe.remove();body.dataset.spinnerCapabilityMix=Object.values(result).includes('ascii')?'mixed':'unicode-narrow';return result};
const requested=new URLSearchParams(location.search).get('glyphs');if(requested==='ascii')apply('ascii','query');else if(requested==='unicode'||requested==='unicode-narrow')apply('unicode-narrow','query');else if(requested==='${esc(policy.measuredQuery)}')measure();else apply('${esc(policy.previewDefault)}','${esc(policy.previewDefaultSource)}');window.calciumSpinnerCapability={get:()=>({global:body.dataset.glyphCapability,source:body.dataset.spinnerCapabilitySource}),set:value=>{if(value!=='ascii'&&value!=='unicode-narrow')throw Error('glyph capability must be ascii or unicode-narrow');apply(value,'api');return value},measure};})();
</script>`;
}

const runtimeCheck = `<script id="generated-runtime-check">
(()=>{const out=document.getElementById('build-status');const fail=message=>{document.documentElement.dataset.specCheck='fail';if(out){out.textContent='Runtime conformance failed: '+message;out.className='build-status c-error'}throw Error(message)};
try{const allowed=new Set(['content','color','opacity','filter']),legalFilter=value=>value==='none'||/^(?:(?:brightness|saturate)\\([^)]*\\))(?:\\s+(?:(?:brightness|saturate)\\([^)]*\\)))*$/.test(value);const visit=rules=>{for(const rule of rules){if(rule.type===CSSRule.KEYFRAMES_RULE){for(const frame of rule.cssRules){for(const property of frame.style){if(!allowed.has(property))fail(rule.name+' uses '+property);if(property==='filter'&&!legalFilter(frame.style.getPropertyValue(property).trim()))fail(rule.name+' uses non-cell-local colour filter');if(property==='content'){const raw=frame.style.getPropertyValue(property).trim();let glyph;try{glyph=JSON.parse(raw)}catch{fail(rule.name+' has non-literal glyph frame '+raw)}if([...glyph].length!==1)fail(rule.name+' swaps a non-single glyph frame '+raw)}}}}else if(rule.cssRules)visit(rule.cssRules)}};for(const sheet of document.styleSheets)visit(sheet.cssRules);document.documentElement.dataset.carrierCheck='pass';
const body=document.body,selected=body.dataset.glyphCapability;if(selected!=='ascii'&&selected!=='unicode-narrow')fail('spinner capability unresolved: '+selected);const saved=selected;body.dataset.glyphCapability='ascii';const asciiProbe=document.createElement('span');asciiProbe.className='sp sp-arrow';asciiProbe.style.cssText='position:absolute;left:-9999px';body.append(asciiProbe);const asciiStyle=getComputedStyle(asciiProbe,'::after'),asciiContent=asciiStyle.content;if(asciiStyle.animationName.split(',')[0].trim()!=='k-arrow-ascii')fail('ASCII spinner CSS not selected: '+asciiStyle.animationName);if(asciiContent==='none'||asciiContent==='normal'||/[←↑→↓]/.test(asciiContent))fail('ASCII arrow emitted '+asciiContent);asciiProbe.remove();body.dataset.glyphCapability=saved;document.documentElement.dataset.spinnerCapabilityCheck='pass';
const probe=document.createElement('span');probe.className='sp sp-agent';probe.style.cssText='position:absolute;left:-9999px;--phase:-2460ms';document.body.append(probe);const cs=getComputedStyle(probe,'::after');const ms=s=>s.trim().endsWith('ms')?parseFloat(s):parseFloat(s)*1000,expectedAgent=body.dataset.glyphCapability==='ascii'?'k-agent-ascii':'k-agent';if(cs.animationName.split(',')[0].trim()!==expectedAgent)fail('cursor animation name '+cs.animationName);if(Math.abs(ms(cs.animationDuration.split(',')[0])-9840)>.5)fail('cursor duration '+cs.animationDuration);if(Math.abs(ms(cs.animationDelay.split(',')[0])+2460)>.5)fail('cursor phase lost: '+cs.animationDelay);if(cs.animationIterationCount.split(',')[0].trim()!=='infinite')fail('cursor iteration '+cs.animationIterationCount);if(!cs.animationTimingFunction.split(',')[0].includes('steps(1'))fail('cursor timing '+cs.animationTimingFunction);probe.remove();document.documentElement.dataset.cursorPhaseCheck='pass';document.documentElement.dataset.specCheck='pass';if(out)out.textContent='Generated registry · carrier compiler pass · spinner capability pass · computed cursor phase pass'}catch(error){fail(error.message)}})();
</script>`;

const glyphGridRuntimeCheck = `<script id="generated-glyph-grid-check">
(()=>{const fail=message=>{document.documentElement.dataset.glyphGridCheck='fail';throw Error(message)};
try{const fixture=document.getElementById('glyph-grid-probes'),cell=document.getElementById('glyph-grid-cell');if(!fixture||!cell)fail('glyph grid fixture missing');
const cellWidth=cell.getBoundingClientRect().width;if(!(cellWidth>0))fail('one-cell reference has no width');const byGlyph=new Map();
for(const row of fixture.querySelectorAll('[data-glyph-grid-probe]')){const id=row.dataset.glyphGridProbe,form=row.dataset.glyphForm,reserved=Number(row.dataset.reservedCells),slot=row.querySelector('.glyph-grid-slot'),value=row.querySelector('.glyph-grid-value'),sentinel=row.querySelector('.glyph-grid-sentinel');if(!id||!['unicode','ascii'].includes(form)||!Number.isInteger(reserved)||reserved<1||!slot||!value||!sentinel)fail('malformed glyph probe row');
const slotRect=slot.getBoundingClientRect(),sentinelRect=sentinel.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(value);const valueWidth=range.getBoundingClientRect().width,expected=reserved*cellWidth,tolerance=Math.max(1,cellWidth*.08);if(Math.abs(slotRect.width-expected)>tolerance)fail(id+' '+form+' reserves '+slotRect.width+'px, expected '+expected+'px');if(valueWidth>slotRect.width+tolerance)fail(id+' '+form+' overflows reservedCells: '+valueWidth+'px > '+slotRect.width+'px');
const coordinate=sentinelRect.left-row.getBoundingClientRect().left;if(!byGlyph.has(id))byGlyph.set(id,new Map());byGlyph.get(id).set(form,coordinate)}
for(const [id,forms] of byGlyph){if(forms.size!==2)fail(id+' lacks both measured capability forms');if(Math.abs(forms.get('unicode')-forms.get('ascii'))>1)fail(id+' shifts the following composed-grid column')}
fixture.dataset.measurement='pass';document.documentElement.dataset.glyphGridCheck='pass';const out=document.getElementById('build-status');if(out&&!out.textContent.includes('composed glyph grid pass'))out.textContent+=' · composed glyph grid pass'}catch(error){fail(error.message)}})();
</script>`;

export function buildHtml(registry, rawRegistry = JSON.stringify(registry)) {
  validateRegistry(registry);
  const hash = createHash('sha256').update(rawRegistry).digest('hex');
  const css = `${registry.shell.baseCss}\n\n${spinnerCss(registry)}\n\n/* GENERATED THEME CSS · current R-THM-001 records only */\n${themeCss(registry)}`;
  const intro = `<p class=sub>The agent surface. ${countClaim(registry, 'themes', 'themes', 'word', 'cap')}, ${countClaim(registry, 'spinnerSets', 'spinner sets', 'number')} and ${countClaim(registry, 'barStyles', 'bar styles', 'word')}, generated from their current registries. Completion panels float above the prompt; choice-only questions normally replace it; text questions normally keep the editor visible. A running call keeps a still mark while its spinner and elapsed value carry liveness.</p>`;
  const revision = `<p class=revision data-count-scope="metadata"><strong>Current specification · revision ${esc(registry.meta.revision)}</strong> — generated from <a class="rule-ref" href="calcium-registry.json">calcium-registry.json</a>. Stable rule IDs and status history are authoritative.</p><p id="build-status" class="build-status" data-count-scope="metadata">Generated registry · browser conformance checks pending</p>`;
  let prefix = registry.shell.bodyPrefix
    .replace('{{INTRO}}', intro)
    .replace('{{REVISION}}', revision)
    .replace('{{THEME_CONTROLS}}', themeControls(registry))
    .replace('<main id="main">', '<main id="main" data-count-scope="prose">')
    .replace('<nav class=contents', '<nav class=contents data-count-scope="metadata"');
  if (!prefix.includes('<main id="main" data-count-scope="prose">')) throw new Error('main prose count scope is missing');
  const renderedSections = scopeSectionNumerals(registry.sections.sort((a, b) => a.order - b.order).map(section => renderSection(registry, section)).join('\n'));
  const manifest = registry.rules.filter(rule => rule.status === 'current').map(({ id, status, title, text, supersedes }) => ({ id, status, title, text, supersedes }));
  const snapshot = `<script type="application/json" id="calcium-current-rule-manifest">${JSON.stringify(manifest).replace(/<\//g, '<\\/')}</script>`;
  const countManifest = Object.entries(registry.countSources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, source]) => ({ key, value: collectionFor(registry, key).length, ...source }));
  const countSnapshot = `<script type="application/json" id="calcium-count-source-manifest">${JSON.stringify(countManifest).replace(/<\//g, '<\\/')}</script>`;
  const suffix = registry.shell.bodySuffix.replace('</main>', `${spinnerCapabilityScript(registry)}${snapshot}${countSnapshot}${runtimeCheck}${glyphGridRuntimeCheck}</main>`);
  const output = `<!-- GENERATED FILE — DO NOT EDIT. Source: calcium-registry.json; builder: build-calcium.mjs; registry-sha256: ${hash} -->\n${registry.shell.doctypeAndHead}\n<style>\n${css}\n</style></head><body data-theme="dark" data-glyph-capability="${esc(registry.spinnerPolicy.previewDefault)}" data-spinner-capability-source="${esc(registry.spinnerPolicy.previewDefaultSource)}">${prefix}${renderedSections}${suffix}</body></html>`;
  const unresolved = output.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) throw new Error(`unresolved shell placeholder ${unresolved[0]}`);
  return output;
}

export function build() {
  const raw = readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(raw);
  const output = buildHtml(registry, raw);
  const keys = renderKeysMarkdown(registry);
  writeFileSync(outputPath, output);
  mkdirSync(dirname(keysOutputPath), { recursive: true });
  writeFileSync(keysOutputPath, keys);
  return { outputPath, keysOutputPath, bytes: Buffer.byteLength(output), rules: registry.rules.length, sections: registry.sections.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = build();
  console.log(`generated ${result.outputPath}`);
  console.log(`${result.bytes} bytes · ${result.rules} stable rule records · ${result.sections} retained sections`);
}
