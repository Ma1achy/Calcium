import { readFileSync } from 'node:fs';
import {
  barSpecimenContentDigest,
  blockContentDigest,
  buildHtml,
  collectionFor,
  keysOutputPath,
  outputPath,
  reconcileSectionBlockIdentities,
  renderKeysMarkdown,
  registryPath,
  ruleContentDigest,
  validateRegistry,
  validateRuleRecords
} from './build-calcium.mjs';

const fail = message => { throw new Error(message); };
const requireText = (source, needle, label = needle) => {
  if (!source.includes(needle)) fail(`missing ${label}`);
};
const rejectText = (source, needle, label = needle) => {
  if (source.includes(needle)) fail(`forbidden ${label}`);
};
const STATE_FACT_KEYS = ['entry', 'carriers', 'actions', 'escape', 'motion-off', 'one-bit', 'residue'];

function extractStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) fail('generated style block missing');
  return match[1];
}

function keyframes(css) {
  const found = [];
  const matcher = /@keyframes\s+([\w-]+)\s*\{/g;
  let match;
  while ((match = matcher.exec(css))) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    while (cursor < css.length && depth) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth) fail(`unclosed @keyframes ${match[1]}`);
    found.push({ name: match[1], body: css.slice(matcher.lastIndex, cursor - 1) });
    matcher.lastIndex = cursor;
  }
  return found;
}

const htmlEsc = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const cssString = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
function contentFrames(animation) {
  if (!animation) return [];
  return [...animation.body.matchAll(/content\s*:\s*("(?:\\.|[^"\\])*")/g)].map(match => JSON.parse(match[1]));
}

// Deliberately verify the compiler through phase run lengths, rather than
// duplicating its per-frame index formula. Each semantic phase appears once.
const fitTrajectory = (pattern, frameCount) => pattern.flatMap((glyph, phase) => {
  const runLength = Math.ceil(((phase + 1) * frameCount) / pattern.length)
    - Math.ceil((phase * frameCount) / pattern.length);
  return Array(runLength).fill(glyph);
});
function independentlyResolveSpinner(registry, spinner, seen = new Set()) {
  if (seen.has(spinner.id)) fail(`spinner checker found a trajectory cycle at ${spinner.id}`);
  if (spinner.asciiTrajectory?.type === 'fit-cycle') return fitTrajectory(spinner.asciiPattern, spinner.frames.length);
  if (spinner.asciiTrajectory?.type === 'composite') {
    const nextSeen = new Set(seen).add(spinner.id);
    return spinner.asciiTrajectory.spinnerIds.flatMap(id => {
      const source = registry.spinners.find(item => item.status === 'current' && item.id === id);
      if (!source) fail(`${spinner.id} checker cannot resolve source ${id}`);
      return independentlyResolveSpinner(registry, source, nextSeen);
    });
  }
  fail(`${spinner.id} checker found unknown trajectory ${spinner.asciiTrajectory?.type}`);
}
const collapseRuns = frames => frames.filter((frame, index) => index === 0 || frame !== frames[index - 1]);

function checkSpinnerFallbacks(registry, html) {
  const css = extractStyle(html);
  const allKeyframes = keyframes(css);
  const current = registry.spinners.filter(item => item.status === 'current');
  const documented = new Map([
    ['growVertical', ['.', 'o', 'O', '@', 'O', 'o']],
    ['growHorizontal', ['.', 'o', 'O', '@', 'O', 'o']],
    ['noise', ['#', '*', '.']],
    ['boxBounce2', ['|', '/', '-', '\\']],
    ['triangle', ['v', '<', '^', '>']],
    ['circleHalves', ['|', '/', '-', '\\']],
    ['pipe', ['|', '/', '-', '\\']],
    ['arrow', ['<', '^', '>', 'v']]
  ]);
  const regressionFrames = new Map([
    ['growVertical', '..ooO@@OOo'],
    ['growHorizontal', '..ooOO@@OOoo'],
    ['fullramp', '.......oooooooOOOOOOO@@@@@@@OOOOOOOooooooo'],
    ['pipe', '||//--\\\\']
  ]);

  requireText(html, 'data-generated-spinner-fallbacks="current"', 'generated normative spinner fallback table');
  rejectText(html, 'ambiguous-width primary  semantic fallback  interval', 'hand-written spinner fallback table');
  rejectText(html, 'other primary sets use their measured one-cell frames unchanged.', 'incomplete spinner fallback claim');
  const fallbackRows = (html.match(/data-spinner-fallback=/g) ?? []).length;
  const inventoryRows = (html.match(/data-spinner-inventory=/g) ?? []).length;
  if (fallbackRows !== current.length) fail(`spinner fallback table has ${fallbackRows} rows; registry has ${current.length}`);
  const reusable = current.filter(item => item.reusable);
  if (inventoryRows !== reusable.length) fail(`spinner inventory has ${inventoryRows} rows; registry has ${reusable.length} reusable sets`);
  requireText(html, '<body data-theme="dark" data-glyph-capability="unicode-narrow" data-spinner-capability-source="rich-preview-default">', 'rich Unicode spinner preview default');
  requireText(html, 'id="generated-spinner-capability"', 'generated spinner capability resolver');
  requireText(html, "requested==='ascii'", 'forced ASCII capability route');
  requireText(html, "requested==='unicode'||requested==='unicode-narrow'", 'forced Unicode capability route');
  requireText(html, "requested==='auto'", 'opt-in measured capability route');
  requireText(html, "for(const [id,glyphs] of Object.entries(sets))", 'per-set measured capability resolution');
  requireText(html, "node.dataset.spinnerCapability=result[id]", 'per-set capability application');
  requireText(html, "animationName.split(',')[0].trim()!=='k-arrow-ascii'", 'computed ASCII spinner selection check');

  for (const spinner of current) {
    const expected = independentlyResolveSpinner(registry, spinner);
    const documentedPattern = documented.get(spinner.id);
    if (documentedPattern && !same(spinner.asciiPattern, documentedPattern)) {
      fail(`${spinner.id} lost its documented ${documentedPattern.join(' ')} ASCII fallback`);
    }
    if (expected.length !== spinner.frames.length) fail(`${spinner.id} fallback did not fit its frame count`);
    if (spinner.asciiTrajectory.type === 'fit-cycle') {
      if (!same(collapseRuns(expected), spinner.asciiPattern)) fail(`${spinner.id} repeats or skips semantic phases`);
    } else {
      const requiredSources = ['fullramp', 'grow', 'bloom', 'starfield', 'pulse'];
      if (spinner.id !== 'agent' || !same(spinner.asciiTrajectory.spinnerIds, requiredSources)) fail(`${spinner.id} has an unexpected composite trajectory`);
      let offset = 0;
      for (const id of requiredSources) {
        const source = current.find(item => item.id === id), segment = expected.slice(offset, offset + source.frames.length);
        if (!same(collapseRuns(segment), source.asciiPattern)) fail(`${spinner.id} corrupts its ${id} trajectory`);
        offset += source.frames.length;
      }
    }
    const regression = regressionFrames.get(spinner.id);
    if (regression && expected.join('') !== regression) fail(`${spinner.id} trajectory regression: ${expected.join('')}`);
    const unicodeAnimations = allKeyframes.filter(item => item.name === spinner.keyframe);
    const asciiName = `${spinner.keyframe}-ascii`;
    const asciiAnimations = allKeyframes.filter(item => item.name === asciiName);
    if (unicodeAnimations.length !== 1) fail(`${spinner.id} has ${unicodeAnimations.length} Unicode CSS alphabets`);
    if (asciiAnimations.length !== 1) fail(`${spinner.id} has ${asciiAnimations.length} ASCII CSS alphabets`);
    if (!same(contentFrames(unicodeAnimations[0]), spinner.frames)) fail(`${spinner.id} Unicode CSS drifted from the registry`);
    if (!same(contentFrames(asciiAnimations[0]), expected)) fail(`${spinner.id} ASCII CSS drifted from its semantic pattern`);
    const patternAttr = htmlEsc(spinner.asciiTrajectory.type === 'fit-cycle' ? spinner.asciiPattern.join('') : spinner.asciiTrajectory.spinnerIds.join('+'));
    const resolvedAttr = htmlEsc(expected.join(''));
    const fallbackPrefix = `data-spinner-fallback="${htmlEsc(spinner.id)}" data-ascii-motion="${htmlEsc(spinner.asciiMotion)}" data-ascii-trajectory="${htmlEsc(spinner.asciiTrajectory.type)}" data-ascii-pattern="${patternAttr}" data-ascii-resolved="${resolvedAttr}" data-glyph-capability="ascii"`;
    requireText(html, fallbackPrefix, `generated fallback table row for ${spinner.id}`);
    if (spinner.reusable) requireText(html, `data-spinner-inventory="${htmlEsc(spinner.id)}" data-ascii-resolved="${resolvedAttr}"`, `generated spinner inventory row for ${spinner.id}`);
    else rejectText(html, `data-spinner-inventory="${htmlEsc(spinner.id)}"`, 'composite agent inserted into reusable spinner gallery');
    requireText(css, `[data-spinner-capability="ascii"] .sp-${spinner.id}::after{content:${cssString(expected[0])};animation-name:${asciiName}}`, `per-set ASCII capability CSS for ${spinner.id}`);
  }
  const agent = current.find(item => item.id === 'agent');
  const composedUnicode = agent.asciiTrajectory.spinnerIds.flatMap(id => current.find(item => item.id === id).frames);
  if (!same(agent.frames, composedUnicode)) fail('agent Unicode walk drifted from its named component sets');
}

function checkCarriers(html) {
  const css = extractStyle(html);
  const allowed = new Set(['content', 'color', 'opacity', 'filter']);
  const frames = keyframes(css);
  if (!frames.length) fail('no animation specimens found');
  for (const animation of frames) {
    for (const match of animation.body.matchAll(/([A-Za-z-]+)\s*:/g)) {
      const property = match[1];
      if (!allowed.has(property)) fail(`${animation.name} uses non-terminal carrier ${property}`);
    }
    for (const match of animation.body.matchAll(/filter\s*:\s*([^;}]+)/g)) {
      const value = match[1].trim();
      if (value !== 'none' && !/^(?:(?:brightness|saturate)\([^)]*\))(?:\s+(?:(?:brightness|saturate)\([^)]*\)))*$/.test(value)) {
        fail(`${animation.name} uses non-cell-local colour filter ${value}`);
      }
    }
  }
  for (const forbidden of ['transform', 'translate', 'scale', 'rotate']) {
    if (frames.some(animation => new RegExp(`(?:^|[;{])\\s*${forbidden}\\s*:`).test(animation.body))) {
      fail(`animated geometry carrier ${forbidden} survived`);
    }
  }
  const tone = new Map(frames.map(item => [item.name, item.body]));
  for (const name of ['shm', 'wav', 'brt', 'pls', 'swb', 'gln', 'tid', 'flk', 'twk', 'pnd', 'wip', 'pop', 'cvg', 'hb', 'mrq', 'rip', 'chs', 'non', 'drf', 'bke', 'sct', 'swp']) {
    const body = tone.get(name);
    if (!body) fail(`missing restored tone effect ${name}`);
    if (!/(?:color|opacity|filter)\s*:/.test(body)) fail(`${name} has no tone carrier`);
  }
  requireText(css, '.rmp-shimmer span{animation:shm 1.8s linear infinite;animation-delay:calc(var(--i)*60ms - 10800ms)}', 'shimmer stagger');
  requireText(css, '@keyframes shm{0%,88%{color:inherit}92%{color:var(--hi);filter:brightness(1.7)}96%,100%{color:inherit}}', 'original shimmer tone carrier');
  requireText(css, '.rmp-wave span{animation:wav 2.4s ease-in-out infinite;animation-delay:calc(var(--i)*70ms - 14400ms)}', 'wave stagger');
  requireText(css, '.rmp-g-lin span{opacity:calc(.45 + var(--i)*.022)}', 'linear ramp opacity carrier');
  requireText(css, '.rmp-g-map span{filter:hue-rotate(calc(var(--i)*7deg)) brightness(calc(.8 + var(--i)*.014))}', 'colour-map ramp carrier');
  requireText(css, '.rmp-g-step span{opacity:calc(.4 + (round(down, var(--i)/6) * .14))}', 'stepped ramp opacity carrier');
  requireText(css, '.rmp-g-cent span{opacity:calc(1 - abs(var(--i) - 14)*.035)}', 'centred ramp opacity carrier');
  requireText(css, '@keyframes drf{0%,100%{opacity:.34;filter:none}45%{opacity:1;filter:brightness(1.55) saturate(1.3)}70%{opacity:.6}}', 'original drift colour carrier');
  rejectText(css, '.rmp-wipe.once-ready', 'one-shot wipe gallery regression');
  rejectText(css, '.rmp-pop.once-ready', 'one-shot pop gallery regression');
  rejectText(css, '.rmp-type.once-ready', 'one-shot typewriter gallery regression');
  rejectText(css, '.rmp-ripple.once-ready', 'one-shot ripple gallery regression');
  rejectText(css, '.rmp-sweep.once-ready', 'retimed sweep gallery regression');
  requireText(css, 'GENERATED SPINNER CSS · current R-MOT-002 and R-MOT-005 records only', 'generated spinner CSS');
  return frames.length;
}

function checkFixes(html) {
  requireText(html, '.sp-agent::after{content:"⋅";animation:k-agent 9840ms steps(1,end) var(--phase,0ms) infinite}', 'phase in animation shorthand');
  rejectText(html, 'animation-delay:var(--phase,0ms)', 'separate cursor animation-delay');
  requireText(html, '«2 and 1» say how many', 'tape delimiters');
  rejectText(html, '⟨2 and 1⟩', 'question mark reused by tape');
  rejectText(html, '  2⟩</span>', 'right question mark reused by tape');
  requireText(html, 'rg --stats -uu            the ', 'exact reviewed standing grant');
  rejectText(html, '⏎ answer   d show full diff', 'second diff-overflow route');
  rejectText(html, 'show the whole file', 'stale second label for approval inspection');
  requireText(html, '←→ choose   ⏎ answer', 'approval footer');
  const choiceLine = html.split('\n').find(line => line.includes(' approve ') && line.includes('always allow edits here'));
  if (!choiceLine) fail('generated approval choices missing');
  const labels = [' approve ', ' deny ', ' show full diff ', ' always allow edits here '];
  let previous = -1;
  for (const label of labels) {
    const index = choiceLine.indexOf(label.trim());
    if (index <= previous) fail(`approval choice order is wrong at ${label.trim()}`);
    previous = index;
  }
  requireText(html, '>❯</span><span class="c-default">  $', 'reader ASCII fallback');
  requireText(html, '>▸</span><span class="c-default">  >', 'focus ASCII fallback');
  requireText(html, '>›</span><span class="c-default">  *', 'current ASCII fallback');
  requireText(html, '>○</span><span class="c-default">  @', 'open-choice ASCII fallback');
  requireText(html, '>✗</span><span class="c-default">  x', 'failure ASCII fallback');
  requireText(html, '>⎿</span><span class="c-default">  `-', 'branch ASCII fallback');
  requireText(html, '1/2   2</span>', 'branch reservedCells');
  requireText(html, '>⋯</span><span class="c-default">  ...', 'ellipsis ASCII fallback');
  requireText(html, '1/3   3</span>', 'ellipsis reservedCells');
  rejectText(html, 'A FAILURE, and it is bounded', 'attention labelled as failure');
  rejectText(html, 'class="c-error">▲', 'attention mark used as failure');
  requireText(html, 'supporting registered marks — inventory-checked, not part of the canonical twelve', 'auxiliary glyph inventory');
}

function checkStateTables(registry, html) {
  const components = registry.stateTableGroups.flatMap(group => group.components.filter(item => item.status === 'current'));
  const definitions = registry.stateTableGroups.reduce((total, group) => total + Object.keys(group.intro.factDefinitions).length, 0);
  const extensions = components.reduce((total, component) => total + component.extensionRows.length, 0);
  const notes = registry.stateTableGroups.reduce((total, group) => total + group.intro.notes.length + group.notes.length, 0);
  const attributeCount = name => (html.match(new RegExp(`\\s${name}="[^"]*"`, 'g')) ?? []).length;

  for (const group of registry.stateTableGroups) {
    if ('introHtml' in group) fail(`${group.renderer} still has raw introHtml`);
    for (const component of group.components) {
      if ('html' in component) fail(`${component.id} still has raw state-table HTML`);
      const keys = Object.keys(component.facts ?? {});
      if (keys.length !== STATE_FACT_KEYS.length || STATE_FACT_KEYS.some(key => !keys.includes(key))) {
        fail(`${component.id} does not have exactly the seven structured facts`);
      }
      requireText(html, `data-state-component="${component.id}"`, `rendered structured component ${component.id}`);
    }
  }
  if (attributeCount('data-state-component') !== components.length) {
    fail(`rendered ${attributeCount('data-state-component')} state components; registry has ${components.length}`);
  }
  if (attributeCount('data-state-fact') !== components.length * STATE_FACT_KEYS.length) {
    fail(`rendered state facts do not equal components × ${STATE_FACT_KEYS.length}`);
  }
  if (attributeCount('data-state-definition') !== definitions) {
    fail(`rendered ${attributeCount('data-state-definition')} state definitions; registry has ${definitions}`);
  }
  if (attributeCount('data-state-extension') !== extensions) {
    fail(`rendered ${attributeCount('data-state-extension')} state extensions; registry has ${extensions}`);
  }
  if (attributeCount('data-state-note') !== notes) {
    fail(`rendered ${attributeCount('data-state-note')} state notes; registry has ${notes}`);
  }
  for (const key of STATE_FACT_KEYS) {
    const expected = components.length + registry.stateTableGroups.filter(group => key in group.intro.factDefinitions).length;
    const actual = (html.match(new RegExp(`data-state-(?:fact|definition)="${key}"`, 'g')) ?? []).length;
    if (actual !== expected) fail(`${key} rendered ${actual} times; expected ${expected}`);
  }
}

function checkStructuredCoverageAndRetention(registry, html) {
  const genericSections = registry.sections.filter(section => !section.renderer);
  if (genericSections.some(section => 'contentHtml' in section)) fail('a generic section retains opaque contentHtml');
  const renderedBlocks = (html.match(/data-section-block="R-(?:BLK|BK[A-Z])-[0-9]{3}"/g) ?? []).length;
  if (renderedBlocks !== registry.sectionBlocks.length) fail(`rendered ${renderedBlocks} structured blocks; registry has ${registry.sectionBlocks.length}`);
  const citedBlocks = (html.match(/data-normative-block="R-(?:BLK|BK[A-Z])-[0-9]{3}"/g) ?? []).length;
  if (citedBlocks !== 0) fail(`rendered ${citedBlocks} specimen blocks as normative citations`);
  for (const block of registry.sectionBlocks) {
    requireText(html, `data-section-block="${block.id}"`, `structured block ${block.id}`);
    requireText(html, `id="${block.id}"`, `stable block anchor ${block.id}`);
    if (block.status !== 'example') fail(`${block.id} is not an example specimen`);
    if (block.contentDigest !== blockContentDigest(block.renderHtml)) fail(`${block.id} content digest drifted`);
  }
  for (const primitive of registry.primitives.filter(item => item.status === 'current')) {
    requireText(html, `data-primitive-defined-in="${primitive.id}"`, `primitive definition mapping ${primitive.id}`);
    for (const key of primitive.definedIn) requireText(html, `href="#${key}"`, `${primitive.id} canonical section ${key}`);
  }
  const currentBars = registry.bars.filter(item => item.status === 'current');
  const currentBarIds = currentBars.map(item => item.id);
  if (!same(registry.barPolicy.placementOrder, currentBarIds)) fail('bar placement order does not retain every current bar exactly once');
  const gallery = registry.barPolicy.gallerySample;
  if (gallery.width !== gallery.filledCells + gallery.emptyCells || Math.round(gallery.value * gallery.width) !== gallery.filledCells) fail('bar gallery quantity is inconsistent');
  requireText(html, `${'█'.repeat(gallery.filledCells)}</span><span class="c-muted">${'░'.repeat(gallery.emptyCells)}`, 'registered block gallery sample');
  const primaryBarIds = new Set(registry.barPolicy.primaryPlacementIds);
  for (const bar of currentBars) {
    requireText(html, `data-bar-alphabet="${bar.id}"`, `bar alphabet ${bar.id}`);
    if (primaryBarIds.has(bar.id)) {
      requireText(html, `data-bar-placement="${bar.id}"`, `primary bar placement ${bar.id}`);
      requireText(html, htmlEsc(bar.placement), `primary bar placement use ${bar.id}`);
    }
  }
  requireText(html, 'data-bar-placement="indeterminate"', 'indeterminate spinner placement');
  for (const specimen of registry.barSpecimens) {
    if (specimen.contentDigest !== barSpecimenContentDigest(specimen)) fail(`${specimen.id} bar specimen digest drifted`);
    requireText(html, `data-bar-specimen="${specimen.id}" data-content-digest="${specimen.contentDigest}"`, `structured bar specimen ${specimen.id}`);
    requireText(html, htmlEsc(specimen.label), `bar specimen label ${specimen.id}`);
  }
  requireText(html, '▮▮▮▮▮▯▯▯', 'five-of-eight posts specimen');
  requireText(html, '###############---------', 'ASCII placement specimen');
  for (const ramp of registry.ramps.filter(item => item.status === 'current')) {
    requireText(html, `data-ramp="${ramp.id}" data-ramp-direction="${ramp.direction}" data-ramp-attention="${ramp.attentionGroup}" data-ramp-meaning="${ramp.meaning.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`, `ramp semantics and meaning ${ramp.id}`);
    requireText(html, `class="c-${ramp.tone} rmp ${ramp.cssClass}" data-ramp-specimen-text="${htmlEsc(ramp.specimenText)}"`, `ramp presentation ${ramp.id}`);
  }
  for (const group of Object.keys(registry.rampPolicy.attentionGroups)) requireText(html, `data-ramp-group="${group}"`, `ramp attention group ${group}`);
  for (const marker of ['data-keymap-policy="universal"', 'data-keymap-rationale="deliberate"', 'data-keymap-rationale="platform"', 'data-keymap-rationale="owned"', 'data-help-policy="durable-entry"', 'data-help-policy="current-scope-first"', 'data-help-policy="grouping"', 'data-help-policy="coverage"', 'data-help-policy="docs"']) {
    requireText(html, marker, `retained keymap/help facet ${marker}`);
  }
  requireText(html, 'Keymap and ? help are generated from R-KEY-007; retained footer specimens remain examples.', 'honest generated keymap/help scope');
  requireText(html, 'Footer hints in retained specimens are examples, not binding projections.', 'retained footer example boundary');
  rejectText(html, 'Generated with ? help and footer hints from R-KEY-001', 'stale footer-generation claim');
  const scopePolicy = registry.keymapPolicy.help.currentScopeFirst;
  requireText(html, htmlEsc(scopePolicy.description), 'current-scope-first help policy');
  const helpSection = html.match(/<section\b[^>]*id="the-help-view-022"[^>]*>([\s\S]*?)<\/section>/);
  if (!helpSection) fail('generated help section missing');
  const helpScopes = [...helpSection[1].matchAll(/<span class="c-default bold bg-bgElev"> ([^<]+) <\/span>/g)].map(match => match[1]);
  if (helpScopes[0] !== scopePolicy.exampleScope) {
    fail(`help renders ${helpScopes[0] ?? 'no scope'} first; expected current scope ${scopePolicy.exampleScope}`);
  }
  requireText(html, registry.keymapPolicy.help.docsTarget, 'shared docs/KEYS.md source contract');
  const measuredItems = registry.glyphs.filter(item => item.status === 'current').length + registry.delimiters.filter(item => item.status === 'current').length;
  const probeRows = (html.match(/data-glyph-grid-probe=/g) ?? []).length;
  if (probeRows !== measuredItems * 2) fail(`glyph grid has ${probeRows} rows; expected Unicode and ASCII rows for ${measuredItems} records`);
  requireText(html, 'id="generated-glyph-grid-check"', 'browser-measured glyph reservation check');
  requireText(html, "range.selectNodeContents(value)", 'actual glyph ink measurement');
  requireText(html, "forms.get('unicode')-forms.get('ascii')", 'following-column composed-grid comparison');
}

function checkImmutableBlockReconciliation() {
  const sectionKey = 'fixture-section';
  const firstHtml = '<p>first retained specimen</p>';
  const secondHtml = '<p>second retained specimen</p>';
  const priorBlocks = [
    { id: 'R-BLK-001', sectionKey, position: 1, renderHtml: firstHtml, contentDigest: blockContentDigest(firstHtml) },
    { id: 'R-BLK-002', sectionKey, position: 2, renderHtml: secondHtml, contentDigest: blockContentDigest(secondHtml) }
  ];
  const reordered = reconcileSectionBlockIdentities({
    sectionKey,
    fragments: [secondHtml, firstHtml],
    priorBlocks,
    usedIds: new Set(priorBlocks.map(block => block.id))
  });
  if (reordered.map(block => block.id).join(' ') !== 'R-BLK-002 R-BLK-001') {
    fail('block reconciliation changed IDs during reorder');
  }
  const editedHtml = '<p>edited retained specimen</p>';
  const edited = reconcileSectionBlockIdentities({
    sectionKey,
    fragments: [editedHtml, secondHtml],
    priorBlocks,
    usedIds: new Set(priorBlocks.map(block => block.id))
  });
  if (edited[0].id === 'R-BLK-001' || edited[1].id !== 'R-BLK-002') {
    fail('block reconciliation overwrote an ID after content mutation');
  }
  let rejectedDigestDrift = false;
  try {
    reconcileSectionBlockIdentities({
      sectionKey,
      fragments: [firstHtml],
      priorBlocks: [{ ...priorBlocks[0], renderHtml: editedHtml }],
      usedIds: new Set(priorBlocks.map(block => block.id))
    });
  } catch (error) {
    rejectedDigestDrift = error.message.includes('content digest drifted');
  }
  if (!rejectedDigestDrift) fail('block reconciliation accepted content drift under a stable ID');
}

function checkImmutableRuleRecords() {
  const successor = {
    id: 'R-TST-002', title: 'Replacement rule', text: 'The replacement remains current.',
    sectionKey: 'fixture', status: 'current', supersedes: ['R-TST-001'], supersededBy: null, legacyIds: []
  };
  successor.contentDigest = ruleContentDigest(successor);
  const retired = {
    id: 'R-TST-001', title: 'Retained old rule', text: 'The original wording remains addressable.',
    sectionKey: 'fixture', status: 'superseded', supersedes: [], supersededBy: successor.id, legacyIds: []
  };
  retired.contentDigest = ruleContentDigest(retired);
  validateRuleRecords([retired, successor]);

  let rejectedMutation = false;
  try {
    validateRuleRecords([retired, { ...successor, text: 'Silently rewritten under the same ID.' }]);
  } catch (error) {
    rejectedMutation = error.message.includes('immutable rule content drifted');
  }
  if (!rejectedMutation) fail('rule registry accepted core content mutation under a stable ID');

  let rejectedAsymmetry = false;
  try {
    const asymmetric = { ...successor, supersedes: [] };
    asymmetric.contentDigest = ruleContentDigest(asymmetric);
    validateRuleRecords([retired, asymmetric]);
  } catch (error) {
    rejectedAsymmetry = /reciprocal|asymmetric/.test(error.message);
  }
  if (!rejectedAsymmetry) fail('rule registry accepted a non-reciprocal supersession link');
}

function jsonScript(html, id) {
  const match = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!match) fail(`missing ${id}`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`${id} is not valid JSON: ${error.message}`);
  }
}

const generatedCountPattern = /<span class="generated-count" data-count-provenance="registry" data-count-key="([^"]+)" data-count-value="([0-9]+)" data-count-format="(number|word)" data-count-casing="(lower|cap|upper)" data-rule-ids="([^"]+)">([^<]*)<\/span>/g;

function independentNumberWord(value) {
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  if (value < 20) return small[value];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (value < 100) return value % 10 ? `${tens[Math.floor(value / 10)]}-${small[value % 10]}` : tens[Math.floor(value / 10)];
  return String(value);
}

function expectedCountText(value, format, casing) {
  let visible = format === 'word' ? independentNumberWord(value) : String(value);
  if (casing === 'upper') visible = visible.toUpperCase();
  if (casing === 'cap') visible = visible.charAt(0).toUpperCase() + visible.slice(1);
  return visible;
}

function validateGeneratedCountMarkers(registry, html) {
  const openings = html.match(/<span\b[^>]*class="generated-count"[^>]*>/g) ?? [];
  const provenanceAttributes = html.match(/\bdata-count-provenance="registry"/g) ?? [];
  const matches = [...html.matchAll(new RegExp(generatedCountPattern.source, 'g'))];
  if (openings.length !== matches.length || provenanceAttributes.length !== matches.length) {
    fail('malformed or detached generated-count provenance marker');
  }
  for (const match of matches) {
    const [, key, rendered, format, casing, citations, visible] = match;
    const source = registry.countSources[key];
    if (!source) fail(`generated count cites unknown source ${key}`);
    const expected = collectionFor(registry, key).length;
    if (Number(rendered) !== expected) fail(`generated count ${key} says ${rendered}; registry has ${expected}`);
    if (visible !== expectedCountText(expected, format, casing)) {
      fail(`generated count ${key} renders ${JSON.stringify(visible)} for ${expected}`);
    }
    const expectedCitations = source.ruleIds.join(' ');
    if (citations !== expectedCitations) fail(`generated count ${key} changed its rule provenance`);
    for (const id of source.ruleIds) {
      if (registry.rules.find(rule => rule.id === id)?.status !== 'current') fail(`generated count ${key} cites non-current ${id}`);
    }
  }
  return matches.map(match => match[0]);
}

const decodeHtmlText = value => value
  .replace(/&(?:#x27|apos);/gi, "'")
  .replace(/&(?:quot|#34);/gi, '"')
  .replace(/&(?:gt|#62);/gi, '>')
  .replace(/&(?:lt|#60);/gi, '<')
  .replace(/&amp;/gi, '&')
  .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
  .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));

function tagAttributes(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/\s([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function checkProseCounts(registry, html) {
  validateGeneratedCountMarkers(registry, html);
  const mainStart = html.match(/<main\b[^>]*>/);
  if (!mainStart) fail('main prose surface missing');
  const mainEnd = html.indexOf('</main>', mainStart.index + mainStart[0].length);
  if (mainEnd < 0) fail('main prose surface is unclosed');
  const surface = html.slice(mainStart.index, mainEnd + '</main>'.length);
  const allowedScopes = new Set(['prose', 'registry-prose', 'specimen', 'metadata']);
  const registrySources = new Set([
    ...registry.rules.map(rule => rule.id),
    ...registry.sectionBlocks.map(block => block.id)
  ]);
  const blockTags = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'td', 'th', 'tr', 'ul']);
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const oneToNine = '(?:one|two|three|four|five|six|seven|eight|nine)';
  const oneToNineteen = `(?:${oneToNine}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)`;
  const tens = '(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)';
  const underHundred = `(?:${oneToNineteen}|${tens}(?:[- ]${oneToNine})?)`;
  const wordCardinal = `(?:zero|${underHundred}|${oneToNine} hundred(?: (?:and )?${underHundred})?)`;
  const cardinal = `(?:[0-9][0-9,]*|${wordCardinal})`;
  const nounToken = "[A-Za-z][A-Za-z'-]{2,}";
  const countStart = `(?<![-.0-9A-Za-z])${cardinal}`;
  const countedPhrase = `(${countStart}\\s+(?:${nounToken}\\s+){0,2}?${nounToken})`;
  const countedPlural = `(${countStart}\\s+(?:${nounToken}\\s+){0,2}?[A-Za-z][A-Za-z'-]*s)`;
  // A number beside a unit or sample value is not automatically an inventory
  // claim. Claims are the grammatical forms that assert a population or a
  // structural total; these are forbidden unless the number is replaced by a
  // validated registry marker. This keeps terminal telemetry honest while a
  // sentence such as “42 widgets are registered” fails in any prose block.
  const rawCountPatterns = [
    new RegExp(`\\b(?:has|have|contains?|comprises?|includes?|needs?|keeps?|uses?|shows?|draws?|takes?|registers?)\\s+${countedPlural}\\b`, 'ig'),
    new RegExp(`\\b${countedPhrase}\\s+(?:is|are)\\s+(?:registered|defined|available|present|required|retained|generated|supported)\\b`, 'ig'),
    new RegExp(`\\b${countedPlural}\\s+(?:exists?|remains?|belongs?|appears?)\\b`, 'ig'),
    new RegExp(`\\bstill\\s+${countedPlural}\\b`, 'ig'),
    new RegExp(`\\bthe same\\b[^,]{0,48},\\s*${countedPlural}\\b`, 'ig'),
    new RegExp(`(?:^|[.!?]\\s+|★\\s*(?:so:\\s*)?)${countedPlural}\\s+(?:exists?|remain|are registered)\\b`, 'ig')
  ];
  const stack = [];
  const findings = [];
  let buffer = '';
  let segmentIndex = 0;
  const flush = () => {
    const normalized = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!normalized) return;
    segmentIndex += 1;
    for (const pattern of rawCountPatterns) {
      for (const match of normalized.matchAll(new RegExp(pattern.source, 'ig'))) {
        findings.push(`segment ${segmentIndex}: ${match[1]}`);
      }
    }
  };
  const effective = () => stack.at(-1) ?? { scope: null, ignored: false, generated: false };

  for (const match of surface.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    const closing = token.match(/^<\/([A-Za-z][\w:-]*)\s*>/);
    if (closing) {
      const tag = closing[1].toLowerCase();
      if (blockTags.has(tag)) flush();
      let index = stack.length - 1;
      while (index >= 0 && stack[index].tag !== tag) index -= 1;
      if (index < 0) fail(`unbalanced prose-scope HTML at </${tag}>`);
      const leaving = stack[index];
      stack.length = index;
      if (leaving.explicitScope) flush();
      continue;
    }
    const opening = token.match(/^<([A-Za-z][\w:-]*)\b/);
    if (opening) {
      const tag = opening[1].toLowerCase();
      const attributes = tagAttributes(token);
      const parent = effective();
      const explicitScope = attributes.get('data-count-scope');
      if (explicitScope && !allowedScopes.has(explicitScope)) fail(`unknown count scope ${explicitScope}`);
      const scope = explicitScope ?? parent.scope;
      if (tag === 'main' && explicitScope !== 'prose') fail('main prose surface lacks data-count-scope="prose"');
      if (explicitScope === 'registry-prose') {
        const source = attributes.get('data-count-source');
        if (!source || !registrySources.has(source)) fail(`registry prose scope has invalid source ${source ?? '(missing)'}`);
      }
      if (explicitScope && explicitScope !== parent.scope) flush();
      if (blockTags.has(tag)) flush();
      const classes = (attributes.get('class') ?? '').split(/\s+/);
      const generated = classes.includes('generated-count');
      if (generated && (scope === 'prose' || scope === 'registry-prose') && !parent.ignored) buffer += ' GENERATED_COUNT ';
      const frame = {
        tag,
        scope,
        explicitScope: Boolean(explicitScope),
        generated,
        ignored: parent.ignored || generated || tag === 'script' || tag === 'style'
      };
      if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(frame);
      continue;
    }
    const frame = effective();
    if (!frame.ignored && (frame.scope === 'prose' || frame.scope === 'registry-prose')) buffer += ` ${decodeHtmlText(token)} `;
  }
  flush();
  if (findings.length) fail(`ungenerated prose count${findings.length === 1 ? '' : 's'}: ${findings.slice(0, 24).join('; ')}${findings.length > 24 ? `; +${findings.length - 24} more` : ''}`);
}

function checkProseCountGuard(registry, html) {
  const prose = body => `<main data-count-scope="prose"><p>${body}</p></main>`;
  const mustReject = [
    'one widget is registered',
    '1 widget is registered',
    'thirteen widgets are registered',
    'thirty widgets are registered',
    '31 widgets are registered',
    'one hundred thirty widgets are registered',
    'the module has fourteen adapters',
    'the same surface, forty containers',
    'the result still 42 artifacts',
    '★ so: nineteen namespaces exist',
    '<em>thirty-two</em> widgets are registered'
  ];
  for (const fixture of mustReject) {
    let rejected = false;
    try { checkProseCounts(registry, prose(fixture)); } catch (error) {
      rejected = error.message.startsWith('ungenerated prose count');
    }
    if (!rejected) fail(`prose-count guard accepted raw count fixture: ${fixture}`);
  }
  for (const fixture of [
    '<main data-count-scope="prose"><pre>42 widgets are registered.</pre></main>',
    '<main data-count-scope="prose"><pre data-count-scope="registry-prose" data-count-source="R-SPC-001">the contract has thirty adapters</pre></main>'
  ]) {
    let rejected = false;
    try { checkProseCounts(registry, fixture); } catch (error) {
      rejected = error.message.startsWith('ungenerated prose count');
    }
    if (!rejected) fail('prose-count guard accepted a raw count inside terminal prose');
  }

  const validMarker = validateGeneratedCountMarkers(registry, html)[0];
  if (!validMarker) fail('generated HTML has no count marker fixture');
  checkProseCounts(registry, prose(`${validMarker} registered widgets`));
  checkProseCounts(registry, `<main data-count-scope="prose"><pre data-count-scope="specimen">184 lines · 6.2 KB · 42 widgets are registered</pre></main>`);
  checkProseCounts(registry, `<main data-count-scope="prose"><p data-count-scope="metadata">version 31 · 30 records</p></main>`);

  const malformed = [
    validMarker.replace(' data-count-provenance="registry"', ''),
    validMarker.replace(/data-count-value="[0-9]+"/, 'data-count-value="999999"'),
    validMarker.replace(/data-count-key="[^"]+"/, 'data-count-key="unknownSource"'),
    validMarker.replace(/data-rule-ids="[^"]+"/, 'data-rule-ids="R-NOT-REAL"'),
    validMarker.replace(/>([^<]*)<\/span>$/, '>999999</span>')
  ];
  for (const fixture of malformed) {
    let rejected = false;
    try { checkProseCounts(registry, prose(`${fixture} widgets`)); } catch {
      rejected = true;
    }
    if (!rejected) fail('prose-count guard accepted a malformed provenance marker');
  }
  for (const fixture of [
    '<main><p>thirty widgets</p></main>',
    '<main data-count-scope="prose"><p data-count-scope="unknown">thirty widgets</p></main>',
    '<main data-count-scope="prose"><p data-count-scope="registry-prose" data-count-source="R-NOT-REAL">thirty widgets</p></main>'
  ]) {
    let rejected = false;
    try { checkProseCounts(registry, fixture); } catch { rejected = true; }
    if (!rejected) fail('prose-count guard accepted an invalid semantic scope');
  }
}

function checkGeneration(registry, html, rawRegistry) {
  const rebuilt = buildHtml(registry, rawRegistry);
  if (rebuilt !== html) fail('generated HTML differs from an in-memory rebuild');
  requireText(html, '<!-- GENERATED FILE — DO NOT EDIT.', 'generated-file banner');
  const sections = (html.match(/<section\b/g) ?? []).length;
  if (sections !== registry.sections.length) fail(`rendered ${sections} sections; registry has ${registry.sections.length}`);
  const citedSections = (html.match(/<section\b[^>]*data-rule-ids=/g) ?? []).length;
  if (citedSections !== sections) fail('a rendered section lacks rule citations');
  const currentSectionCitations = (html.match(/<section\b[^>]*data-rule-status="current"/g) ?? []).length;
  const exampleSections = (html.match(/<section\b[^>]*data-rule-status="example"/g) ?? []).length;
  const expectedCurrentSections = registry.sections.filter(section => section.renderer || section.blockIds).length;
  const expectedExampleSections = sections - expectedCurrentSections;
  if (currentSectionCitations !== expectedCurrentSections) fail(`rendered ${currentSectionCitations} current projections; expected ${expectedCurrentSections}`);
  if (exampleSections !== expectedExampleSections) fail(`rendered ${exampleSections} example sections; expected ${expectedExampleSections}`);
  requireText(html, 'EXAMPLE sections cannot create a requirement.', 'explicit normative boundary');
  const currentRules = registry.rules.filter(rule => rule.status === 'current');
  const retiredNormativeBlockRule = registry.rules.find(rule => rule.id === 'R-REG-001');
  const normativeBlockRule = registry.rules.find(rule => rule.id === 'R-REG-002');
  if (retiredNormativeBlockRule?.status !== 'superseded' || retiredNormativeBlockRule.supersededBy !== 'R-REG-002') {
    fail('R-REG-001 is not retained as the superseded predecessor of R-REG-002');
  }
  if (normativeBlockRule?.status !== 'current' || !normativeBlockRule.supersedes.includes('R-REG-001')) {
    fail('R-REG-002 is not the reciprocal current successor of R-REG-001');
  }
  rejectText(JSON.stringify(currentRules), 'Every prescriptive specimen block is owned', 'stale normative specimen-block claim');
  requireText(html, 'Normative authority belongs only to explicit current core or atomic rule records.', 'honest normative authority rule');
  if (currentRules.some(rule => rule.id.startsWith('R-SEC-'))) fail('a section-wide umbrella is still current');
  rejectText(html, 'data-rule-ids="R-SEC-', 'section cites a section-wide umbrella');
  for (const rule of currentRules) requireText(html, `id="${rule.id}"`, `current rule anchor ${rule.id}`);
  for (const rule of registry.rules.filter(rule => rule.status === 'superseded')) {
    requireText(html, `id="${rule.id}"`, `retained superseded rule ${rule.id}`);
    requireText(html, `href="#${rule.supersededBy}"`, `replacement link for ${rule.id}`);
  }
  for (const section of registry.sections) {
    requireText(html, `data-example-id="${section.recordId}"`, `example provenance for ${section.key}`);
    requireText(html, `id="${section.recordId}"`, `example rule anchor ${section.recordId}`);
    if (section.ruleSetKey) {
      const items = section.ruleSetKey.split('.').reduce((value, part) => value?.[part], registry);
      if (!Array.isArray(items)) fail(`${section.key} atomic rule set is missing`);
      for (const item of items) {
        requireText(html, `data-atomic-rule="${item.id}"`, `atomic marker ${section.key}.${item.id}`);
        requireText(html, `href="#${item.ruleIds[0]}"`, `atomic citation ${section.key}.${item.id}`);
      }
    }
  }
  validateGeneratedCountMarkers(registry, html);
  rejectText(html, '34 bindings', 'hand-written binding count');
  rejectText(html, 'SPEC-001  ', 'legacy hand-maintained contract id');
  requireText(html, 'GENERATED THEME CSS · current R-THM-001 records only', 'generated theme CSS zone');
  requireText(html, 'Generated from CURRENT registry records only.', 'generated condensed page');
  requireText(html, 'id="calcium-current-rule-manifest"', 'embedded current-rule manifest');
  const emittedCounts = jsonScript(html, 'calcium-count-source-manifest');
  if (!Array.isArray(emittedCounts)) fail('calcium-count-source-manifest is not an array');
  const emittedByKey = new Map();
  for (const item of emittedCounts) {
    if (!item?.key || emittedByKey.has(item.key)) fail(`duplicate or missing emitted count key ${item?.key}`);
    emittedByKey.set(item.key, item);
  }
  for (const [key, source] of Object.entries(registry.countSources)) {
    const emitted = emittedByKey.get(key);
    if (!emitted) fail(`count source ${key} was not emitted`);
    const expected = collectionFor(registry, key).length;
    if (emitted.value !== expected) fail(`count manifest ${key} says ${emitted.value}; registry has ${expected}`);
    for (const field of ['collection', 'where', 'range', 'statuses', 'ruleIds']) {
      if (JSON.stringify(emitted[field]) !== JSON.stringify(source[field])) fail(`count manifest ${key} changed ${field}`);
    }
  }
  if (emittedByKey.size !== Object.keys(registry.countSources).length) fail('count manifest contains an unknown count source');
  requireText(html, 'id="generated-runtime-check"', 'computed-style browser checks');
  requireText(html, 'the third choice is an INSPECTION, not an answer; there is no second key-only path', 'single inspection path in ownership specimen');
  rejectText(html, '<span class="c-muted">  ○ </span><span class="c-muted">show the whole file</span>', 'detached approval inspection path');
  for (const spinner of registry.spinners.filter(item => item.status === 'current')) {
    requireText(html, `@keyframes ${spinner.keyframe}{`, `generated spinner keyframes for ${spinner.id}`);
    requireText(html, `@keyframes ${spinner.keyframe}-ascii{`, `generated ASCII spinner keyframes for ${spinner.id}`);
  }
}

const rawRegistry = readFileSync(registryPath, 'utf8');
const registry = validateRegistry(JSON.parse(rawRegistry));
const html = readFileSync(outputPath, 'utf8');
const keysMarkdown = readFileSync(keysOutputPath, 'utf8');
if (registry.keymapPolicy.help.docsTarget !== 'docs/KEYS.md') fail('generated keymap target changed without moving its artifact');
if (keysMarkdown !== renderKeysMarkdown(registry)) fail('docs/KEYS.md differs from the binding registry projection');
checkImmutableBlockReconciliation();
checkImmutableRuleRecords();
checkProseCountGuard(registry, html);
checkGeneration(registry, html, rawRegistry);
checkStructuredCoverageAndRetention(registry, html);
checkStateTables(registry, html);
checkProseCounts(registry, html);
checkSpinnerFallbacks(registry, html);
const animationCount = checkCarriers(html);
checkFixes(html);

console.log('Calcium build checks passed');
console.log(`${registry.rules.length} stable rules · ${registry.sections.length} retained sections · ${animationCount} legal keyframes`);
console.log(`${registry.rules.filter(rule => rule.status === 'superseded').length} superseded rules retained with reciprocal replacement links`);
